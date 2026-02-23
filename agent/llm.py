from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os
import logging

logger = logging.getLogger(__name__)

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")

try:
    from langchain.chat_models import ChatOpenAI
except Exception:
    try:
        from langchain_openai import ChatOpenAI
    except Exception:
        ChatOpenAI = None

MODEL_NAME = "gpt-4.1-mini"
TEMPERATURE = float("0.7")

llm = None
if ChatOpenAI is not None:
    try:
        if api_key:
            logger.info(f"Initializing ChatOpenAI with model: {MODEL_NAME}")
            llm = ChatOpenAI(
                model_name=MODEL_NAME,
                temperature=TEMPERATURE,
                api_key=api_key,
            )
            logger.info("ChatOpenAI initialized successfully with API key")
        else:
            logger.warning("OPENAI_API_KEY not found in environment variables. Using fallback.")
            llm = None
    except Exception as e:
        logger.error(f"Failed to initialize ChatOpenAI: {e}")
        llm = None
else:
    logger.error("ChatOpenAI class not available")