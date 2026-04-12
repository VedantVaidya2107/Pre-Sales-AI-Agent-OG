import os
from twilio.rest import Client
from loguru import logger
from dotenv import load_dotenv

load_dotenv()

def test_twilio_auth():
    account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_number = os.environ.get("TWILIO_FROM_NUMBER")

    logger.info(f"Using Account SID: {account_sid}")
    logger.info(f"Using Auth Token: {auth_token[:4]}...{auth_token[-4:]} (Length: {len(auth_token)})")

    client = Client(account_sid, auth_token)

    try:
        # Try to fetch the account details to verify authentication
        account = client.api.accounts(account_sid).fetch()
        logger.success(f"Authentication successful! Account Name: {account.friendly_name}")
        
    except Exception as e:
        logger.error(f"Authentication failed with error:\n{str(e)}")

if __name__ == "__main__":
    test_twilio_auth()
