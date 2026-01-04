import redis
import os
import json
from functools import wraps
from typing import Optional, Any

# Connect to Azure Redis Cache
redis_client = redis.from_url(
    os.getenv("REDIS_URL", "redis://localhost:6379"),
    decode_responses=True
)

def cache_response(expire_seconds: int = 300):
    """Decorator to cache API responses"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key from function name and arguments
            cache_key = f"{func.__name__}:{str(args)}:{str(kwargs)}"
            
            # Try to get from cache
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
            
            # Execute function and cache result
            result = await func(*args, **kwargs)
            redis_client.setex(
                cache_key,
                expire_seconds,
                json.dumps(result)
            )
            return result
        return wrapper
    return decorator