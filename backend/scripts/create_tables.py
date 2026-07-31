"""
Script to create all DynamoDB tables for the Elder Care AI App.
Run this once to set up the database.
"""
import boto3
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

region = os.getenv("AWS_REGION", "us-east-1")
dynamodb = boto3.client("dynamodb", region_name=region)


def create_table(table_name, key_schema, attribute_definitions, gsi=None):
    """Create a DynamoDB table."""
    params = {
        "TableName": table_name,
        "KeySchema": key_schema,
        "AttributeDefinitions": attribute_definitions,
        "BillingMode": "PAY_PER_REQUEST"
    }
    if gsi:
        params["GlobalSecondaryIndexes"] = gsi

    try:
        dynamodb.create_table(**params)
        print(f"✓ Created table: {table_name}")
    except dynamodb.exceptions.ResourceInUseException:
        print(f"  Table already exists: {table_name}")
    except Exception as e:
        print(f"✗ Error creating {table_name}: {e}")


def main():
    print("Creating DynamoDB tables...\n")

    # Accounts
    create_table(
        "Accounts",
        key_schema=[{"AttributeName": "account_id", "KeyType": "HASH"}],
        attribute_definitions=[{"AttributeName": "account_id", "AttributeType": "S"}]
    )

    # Follows
    create_table(
        "Follows",
        key_schema=[{"AttributeName": "follow_id", "KeyType": "HASH"}],
        attribute_definitions=[
            {"AttributeName": "follow_id", "AttributeType": "S"},
            {"AttributeName": "follower_id", "AttributeType": "S"},
            {"AttributeName": "followee_id", "AttributeType": "S"}
        ],
        gsi=[
            {
                "IndexName": "follower_id-index",
                "KeySchema": [{"AttributeName": "follower_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"}
            },
            {
                "IndexName": "followee_id-index",
                "KeySchema": [{"AttributeName": "followee_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"}
            }
        ]
    )

    # Facts
    create_table(
        "Facts",
        key_schema=[{"AttributeName": "fact_id", "KeyType": "HASH"}],
        attribute_definitions=[
            {"AttributeName": "fact_id", "AttributeType": "S"},
            {"AttributeName": "account_id", "AttributeType": "S"}
        ],
        gsi=[
            {
                "IndexName": "account_id-index",
                "KeySchema": [{"AttributeName": "account_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"}
            }
        ]
    )

    # FactHistory
    create_table(
        "FactHistory",
        key_schema=[{"AttributeName": "history_id", "KeyType": "HASH"}],
        attribute_definitions=[{"AttributeName": "history_id", "AttributeType": "S"}]
    )

    # Sessions
    create_table(
        "Sessions",
        key_schema=[{"AttributeName": "session_id", "KeyType": "HASH"}],
        attribute_definitions=[{"AttributeName": "session_id", "AttributeType": "S"}]
    )

    # Messages
    create_table(
        "Messages",
        key_schema=[{"AttributeName": "message_id", "KeyType": "HASH"}],
        attribute_definitions=[{"AttributeName": "message_id", "AttributeType": "S"}]
    )

    # DailySummaries
    create_table(
        "DailySummaries",
        key_schema=[{"AttributeName": "account_id#date", "KeyType": "HASH"}],
        attribute_definitions=[{"AttributeName": "account_id#date", "AttributeType": "S"}]
    )

    # HealthKnowledgeBase
    create_table(
        "HealthKnowledgeBase",
        key_schema=[{"AttributeName": "topic_id", "KeyType": "HASH"}],
        attribute_definitions=[{"AttributeName": "topic_id", "AttributeType": "S"}]
    )

    print("\n✓ All tables created successfully!")


if __name__ == "__main__":
    main()
