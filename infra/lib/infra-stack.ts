import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as path from 'path';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================================
    // 1. DynamoDB Tables — already exist, reference them
    // ========================================================
    dynamodb.Table.fromTableName(this, 'Accounts', 'Accounts');
    dynamodb.Table.fromTableName(this, 'Facts', 'Facts');
    dynamodb.Table.fromTableName(this, 'FactHistory', 'FactHistory');
    dynamodb.Table.fromTableName(this, 'Sessions', 'Sessions');
    dynamodb.Table.fromTableName(this, 'Messages', 'Messages');
    dynamodb.Table.fromTableName(this, 'Follows', 'Follows');
    dynamodb.Table.fromTableName(this, 'DailySummaries', 'DailySummaries');
    dynamodb.Table.fromTableName(this, 'HealthKnowledgeBase', 'HealthKnowledgeBase');

    // ========================================================
    // 2. Cognito — use teammate's existing User Pool + deploy App Client
    // ========================================================
    const userPoolId = 'us-west-2_hLJ2ZEJgE';
    const userPoolClientId = '744ha802u14gq1rkkqt076rbe6';
    const cognitoDomain = 'us-west-2hlj2zejge.auth.us-west-2.amazoncognito.com';

    cognito.UserPool.fromUserPoolId(this, 'ElderAiUserPool', userPoolId);

    // Client Secret — read from existing Secrets Manager secret (no plaintext in code)
    const clientSecretArn = 'arn:aws:secretsmanager:us-west-2:756933139750:secret:elder-ai/cognito-deploy-client-secret-mSoOou';
    const clientSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this, 'CognitoClientSecret', clientSecretArn
    );

    // ========================================================
    // 3. VPC + ECS Cluster
    // ========================================================
    const vpc = new ec2.Vpc(this, 'ElderAiVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    const cluster = new ecs.Cluster(this, 'ElderAiCluster', {
      vpc,
      clusterName: 'elder-ai-cluster',
    });

    // ========================================================
    // 4. ECS Task Definition (Flask API + STT in same task)
    // ========================================================
    const taskDef = new ecs.FargateTaskDefinition(this, 'ElderAiTask', {
      memoryLimitMiB: 1024,
      cpu: 512,
      executionRole: new iam.Role(this, 'ElderAiTaskExecutionRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
        ],
      }),
    });

    // IAM permissions for the task role (runtime)
    taskDef.taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess')
    );
    taskDef.taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonPollyFullAccess')
    );
    taskDef.taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonTranscribeFullAccess')
    );
    taskDef.taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    // IAM permission for the execution role (pull secrets at startup)
    // Note: CDK also auto-grants via ecs.Secret.fromSecretsManager, this is explicit for clarity
    clientSecret.grantRead(taskDef.executionRole!);

    // Flask API container
    const apiImage = new ecr_assets.DockerImageAsset(this, 'ApiImage', {
      directory: path.join(__dirname, '../../backend'),
      file: 'Dockerfile',
      exclude: ['stt_service', '.venv', '__pycache__', 'logs', '.env', '.env.*'],
      platform: ecr_assets.Platform.LINUX_AMD64,
    });

    taskDef.addContainer('api', {
      image: ecs.ContainerImage.fromDockerImageAsset(apiImage),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'elder-api',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        AWS_REGION: 'us-west-2',
        BEDROCK_MODEL_ID: 'amazon.nova-lite-v1:0',
        BEDROCK_REGION: 'us-west-2',
        DYNAMODB_REGION: 'us-west-2',
        COGNITO_USER_POOL_ID: userPoolId,
        COGNITO_APP_CLIENT_ID: userPoolClientId,
        STT_SERVICE_URL: 'ws://localhost:8001/ws/transcribe',
        FRONTEND_URL: 'https://dxssbmpgir7nj.cloudfront.net',
        COGNITO_REDIRECT_URI: 'https://dxssbmpgir7nj.cloudfront.net/api/auth/callback',
        COGNITO_DOMAIN: cognitoDomain,
      },
      secrets: {
        COGNITO_APP_CLIENT_SECRET: ecs.Secret.fromSecretsManager(clientSecret, 'COGNITO_APP_CLIENT_SECRET'),
      },
      portMappings: [{ containerPort: 5000 }],
    });

    // STT container
    const sttImage = new ecr_assets.DockerImageAsset(this, 'SttImage', {
      directory: path.join(__dirname, '../../backend/stt_service'),
      file: 'Dockerfile',
      platform: ecr_assets.Platform.LINUX_AMD64,
    });

    taskDef.addContainer('stt', {
      image: ecs.ContainerImage.fromDockerImageAsset(sttImage),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'elder-stt',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        AWS_REGION: 'us-west-2',
        FRONTEND_URL: 'https://dxssbmpgir7nj.cloudfront.net',
      },
      portMappings: [{ containerPort: 8001 }],
    });

    // ========================================================
    // 5. ALB + ECS Service
    // ========================================================
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ElderAiAlb', {
      vpc,
      internetFacing: true,
    });

    const listener = alb.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      open: false,
    });

    // Only CloudFront origin-facing servers may connect directly to the ALB.
    // The prefix list ID is AWS-managed for us-west-2.
    alb.connections.allowFrom(
      ec2.Peer.prefixList('pl-82a045eb'),
      ec2.Port.tcp(80),
      'Allow CloudFront origin-facing traffic only'
    );

    const service = new ecs.FargateService(this, 'ElderAiService', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      assignPublicIp: true,
      circuitBreaker: { enable: true, rollback: true },
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // API target group
    listener.addTargets('ApiTarget', {
      port: 5000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service.loadBalancerTarget({ containerName: 'api', containerPort: 5000 })],
      healthCheck: {
        path: '/api/health',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
      },
      conditions: [elbv2.ListenerCondition.pathPatterns(['/api/*'])],
      priority: 10,
    });

    // STT WebSocket target group
    const sttTarget = listener.addTargets('SttTarget', {
      port: 8001,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service.loadBalancerTarget({ containerName: 'stt', containerPort: 8001 })],
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(30),
        healthyThresholdCount: 2,
      },
      conditions: [elbv2.ListenerCondition.pathPatterns(['/ws/*'])],
      priority: 20,
    });
    // Enable stickiness for WebSocket
    sttTarget.setAttribute('stickiness.enabled', 'true');
    sttTarget.setAttribute('stickiness.type', 'lb_cookie');

    // Default action (will be handled by CloudFront → S3 for frontend)
    listener.addAction('DefaultAction', {
      action: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Not Found',
      }),
    });

    // ========================================================
    // 6. S3 + CloudFront (Frontend)
    // ========================================================
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `elder-ai-frontend-${cdk.Aws.ACCOUNT_ID}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // CloudFront Function enforces the competition IP allowlist on every behavior.
    // For frontend routes, it also preserves the existing SPA rewrite behavior.
    const spaRewriteFunction = new cloudfront.Function(this, 'SpaRewriteFunction', {
      functionName: 'elder-ai-spa-rewrite',
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var viewerIp = event.viewer && event.viewer.ip;
  var allowedIps = {
    '60.250.15.18': true,
    '60.250.15.19': true,
    '60.250.15.34': true,
    '60.250.15.35': true,
    '60.250.15.36': true,
    '60.250.15.50': true,
    '60.250.15.51': true,
    '60.250.15.52': true
  };

  if (!viewerIp || !allowedIps[viewerIp]) {
    return {
      statusCode: 403,
      statusDescription: 'Forbidden',
      headers: {
        'content-type': { value: 'text/plain; charset=utf-8' },
        'cache-control': { value: 'no-store' }
      }
    };
  }

  var uri = request.uri;
  var method = request.method;

  // API and WebSocket paths only need the IP check, never SPA rewriting.
  if (uri.indexOf('/api/') === 0 || uri.indexOf('/ws/') === 0) {
    return request;
  }

  // Only rewrite GET and HEAD requests
  if (method !== 'GET' && method !== 'HEAD') {
    return request;
  }

  // If URI has a file extension (e.g. .js, .css, .html, .png, .svg, .ico), don't rewrite
  if (uri.match(/\\.[a-zA-Z0-9]+$/)) {
    return request;
  }

  // Rewrite to /index.html for SPA client-side routing
  request.uri = '/index.html';
  return request;
}
`),
    });

    const viewerRequestAssociation = [{
      function: spaRewriteFunction,
      eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
    }];

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'ElderAiCdn', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: viewerRequestAssociation,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.LoadBalancerV2Origin(alb, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
          functionAssociations: viewerRequestAssociation,
        },
        '/ws/*': {
          origin: new origins.LoadBalancerV2Origin(alb, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
          functionAssociations: viewerRequestAssociation,
        },
      },
      defaultRootObject: 'index.html',
      enableIpv6: false,
    });

    // ========================================================
    // 7. Outputs
    // ========================================================
    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL (your demo site)',
    });

    new cdk.CfnOutput(this, 'AlbUrl', {
      value: `http://${alb.loadBalancerDnsName}`,
      description: 'ALB URL (API backend)',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPoolId,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClientId,
    });

    new cdk.CfnOutput(this, 'CognitoDomain', {
      value: cognitoDomain,
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
    });
  }
}
