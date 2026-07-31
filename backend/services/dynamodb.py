import boto3
from config import Config

dynamodb = boto3.resource("dynamodb", region_name=Config.DYNAMODB_REGION)

# Table references
accounts_table = dynamodb.Table("Accounts")
follows_table = dynamodb.Table("Follows")
facts_table = dynamodb.Table("Facts")
fact_history_table = dynamodb.Table("FactHistory")
sessions_table = dynamodb.Table("Sessions")
messages_table = dynamodb.Table("Messages")
daily_summaries_table = dynamodb.Table("DailySummaries")
health_kb_table = dynamodb.Table("HealthKnowledgeBase")

# DynamoDB client for transact_write_items
dynamodb_client = boto3.client("dynamodb", region_name=Config.DYNAMODB_REGION)
