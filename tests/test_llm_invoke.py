import asyncio
from agent.llm_client import generate
from agent.llm import llm
from langchain_core.messages import HumanMessage

# Test invoke directly
result = llm.invoke([HumanMessage(content="Hello")])
print(f"invoke result type: {type(result)}")
print(f"invoke result: {result}")
print(f"has content: {hasattr(result, 'content')}")
if hasattr(result, 'content'):
    print(f"content value: {result.content}")
