import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import * as vm from 'node:vm';
import { InfraStack } from '../lib/infra-stack';

const allowedIps = [
  '60.250.15.18', '60.250.15.19', '60.250.15.34', '60.250.15.35',
  '60.250.15.36', '60.250.15.50', '60.250.15.51', '60.250.15.52',
];

function synthesizedTemplate(): Record<string, any> {
  const app = new cdk.App();
  const stack = new InfraStack(app, 'AllowlistTestStack', {
    env: { account: '111111111111', region: 'us-west-2' },
  });
  return Template.fromStack(stack).toJSON();
}

function viewerRequestHandler(): (event: any) => any {
  const template = synthesizedTemplate();
  const resource = Object.values(template.Resources)
    .find((item: any) => item.Type === 'AWS::CloudFront::Function') as any;
  const context: Record<string, any> = {};
  vm.runInNewContext(`${resource.Properties.FunctionCode}\nresult = handler;`, context);
  return context.result;
}

function request(ip: string, uri: string, method = 'GET'): any {
  return viewerRequestHandler()({ viewer: { ip }, request: { uri, method, headers: {} } });
}

describe('CloudFront viewer IP allowlist', () => {
  test.each(allowedIps)('allows %s', (ip) => {
    expect(request(ip, '/api/health').statusCode).toBeUndefined();
  });

  test('rejects other IPv4 and IPv6 addresses', () => {
    expect(request('203.0.113.10', '/').statusCode).toBe(403);
    expect(request('2001:db8::1', '/').statusCode).toBe(403);
  });

  test('rewrites only frontend SPA routes', () => {
    expect(request(allowedIps[0], '/dashboard').uri).toBe('/index.html');
    expect(request(allowedIps[0], '/assets/app.js').uri).toBe('/assets/app.js');
    expect(request(allowedIps[0], '/dashboard', 'POST').uri).toBe('/dashboard');
    expect(request(allowedIps[0], '/api/health').uri).toBe('/api/health');
    expect(request(allowedIps[0], '/ws/transcribe').uri).toBe('/ws/transcribe');
  });

  test('associates every behavior, disables IPv6, and restricts ALB ingress', () => {
    const resources = synthesizedTemplate().Resources;
    const distribution = Object.values(resources)
      .find((item: any) => item.Type === 'AWS::CloudFront::Distribution') as any;
    const config = distribution.Properties.DistributionConfig;
    expect(config.IPV6Enabled).toBe(false);
    expect(config.DefaultCacheBehavior.FunctionAssociations).toHaveLength(1);
    expect(config.CacheBehaviors).toHaveLength(2);
    expect(config.CacheBehaviors.every((item: any) => item.FunctionAssociations?.length === 1)).toBe(true);

    const albSecurityGroup = Object.entries(resources)
      .find(([, item]: [string, any]) =>
        item.Type === 'AWS::EC2::SecurityGroup'
        && item.Properties.GroupDescription.includes('ElderAiAlb')) as [string, any];
    const albIngress = Object.values(resources).filter((item: any) =>
      item.Type === 'AWS::EC2::SecurityGroupIngress'
      && item.Properties.GroupId?.['Fn::GetAtt']?.[0] === albSecurityGroup[0]) as any[];
    expect(albIngress).toHaveLength(1);
    expect(albIngress[0].Properties.CidrIp).toBeUndefined();
    expect(albIngress[0].Properties.SourcePrefixListId).toBe('pl-82a045eb');
  });
});
