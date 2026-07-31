import base64
import boto3
from config import Config
from services.logger import polly_logger

polly_client = boto3.client("polly", region_name=Config.AWS_REGION)


def synthesize_speech(text: str) -> str:
    """Convert text to speech using Amazon Polly.
    Returns base64 encoded audio data."""
    polly_logger.info(f"TTS request, text_length={len(text)}")
    try:
        response = polly_client.synthesize_speech(
            Text=text,
            OutputFormat="mp3",
            VoiceId="Zhiyu",
            LanguageCode="cmn-CN",
            Engine="neural"
        )

        audio_stream = response["AudioStream"].read()
        audio_base64 = base64.b64encode(audio_stream).decode("utf-8")
        polly_logger.info(f"TTS success, audio_size={len(audio_stream)} bytes")
        return audio_base64

    except Exception as e:
        polly_logger.error(f"Polly TTS error: {type(e).__name__}: {e}", exc_info=True)
        return ""
