import json
import os
from datetime import datetime

import redis

from app.config import settings
from app.models.dom import DOMUpdate


class StorageService:
    """Service for storing DOM snapshots and metadata"""
    
    # Initialize Redis connection
    _redis_client = None
    
    @classmethod
    def get_redis(cls):
        """Get or create Redis connection"""
        if cls._redis_client is None:
            cls._redis_client = redis.Redis(
                host=settings.REDIS_HOST,
                port=settings.REDIS_PORT,
                db=settings.REDIS_DB,
                password=settings.REDIS_PASSWORD or None,
                decode_responses=True
            )
        return cls._redis_client

    @staticmethod
    def ensure_snapshots_directory():
        """Ensure the snapshots directory exists"""
        os.makedirs(settings.SNAPSHOTS_DIR, exist_ok=True)

    @classmethod
    def save_dom_snapshot(cls, update: DOMUpdate) -> dict:
        """Save DOM snapshot and metadata to disk"""
        cls.ensure_snapshots_directory()

        # Parse timestamp
        timestamp = datetime.fromisoformat(
            update.dom_data.timestamp.replace('Z', '+00:00'))

        # Create base filename
        base_filename = f"task_{update.task_id}_{timestamp.strftime('%Y%m%d_%H%M%S')}"

        # HTML file path
        html_filename = f"{settings.SNAPSHOTS_DIR}/{base_filename}.html"

        # Save HTML content
        with open(html_filename, "w", encoding="utf-8") as f:
            f.write(update.dom_data.html)

        # Create metadata
        metadata = {
            "task_id": update.task_id,
            "url": update.dom_data.url,
            "title": update.dom_data.title,
            "timestamp": update.dom_data.timestamp,
            "results": update.result,
            "iterations": update.iterations
        }

        # Metadata file path
        metadata_filename = f"{settings.SNAPSHOTS_DIR}/{base_filename}_metadata.json"

        # Save metadata
        with open(metadata_filename, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)

        # Save DOM structure if available
        if update.structure:
            structure_filename = f"{settings.SNAPSHOTS_DIR}/{base_filename}_structure.json"
            with open(structure_filename, "w", encoding="utf-8") as f:
                json.dump(update.structure, f, indent=2)

        # print("Current update: ", update)

        # NOTE: We've moved the Redis history update to the tasks.py endpoint
        # to store the processed_result actions instead of update.result

        return {
            "html": html_filename,
            "metadata": metadata_filename,
            "structure": f"{settings.SNAPSHOTS_DIR}/{base_filename}_structure.json" if update.structure else None
        }
        
    @classmethod
    def normalize_task_id(cls, task_id: str) -> str:
        """Normalize task ID to remove any prefix duplication"""
        # If the task_id already starts with 'task_', don't add it again in the Redis key
        if task_id.startswith(settings.REDIS_TASK_PREFIX):
            return task_id
        return f"{settings.REDIS_TASK_PREFIX}{task_id}"
    
    @classmethod
    def store_task(cls, task_id: str, task_text: str) -> bool:
        """Store a task in Redis"""
        normalized_id = cls.normalize_task_id(task_id)
        redis_key = f"{settings.REDIS_PREFIX}{normalized_id}"
        print(f"Storing task with Redis key: {redis_key}")
        return cls.get_redis().set(
            redis_key, 
            task_text,
            ex=settings.REDIS_TASK_TTL
        )
    
    @classmethod
    def get_task(cls, task_id: str) -> str:
        """Get a task from Redis"""
        normalized_id = cls.normalize_task_id(task_id)
        redis_key = f"{settings.REDIS_PREFIX}{normalized_id}"
        print(f"Getting task with Redis key: {redis_key}")
        return cls.get_redis().get(redis_key)
    
    @classmethod
    def append_task_history(cls, task_id: str, action_data: dict) -> bool:
        """Append action history for a task"""
        normalized_id = cls.normalize_task_id(task_id)
        redis_key = f"{settings.REDIS_PREFIX}{settings.REDIS_TASK_HISTORY_PREFIX}{normalized_id}"
        redis_client = cls.get_redis()
        
        print(f"Appending task history with Redis key: {redis_key}")
        
        try:
            # Simply append the new item to the list (more efficient than recreating)
            redis_client.rpush(redis_key, json.dumps(action_data))
            
            # check if added
            history_list = redis_client.lrange(redis_key, 0, -1)
            print(f"Added history item to Redis. Current history length: {len(history_list)}")
            
            # Make sure expiration is set
            redis_client.expire(redis_key, settings.REDIS_TASK_TTL)
            return True
        except Exception as e:
            print(f"Error appending task history: {str(e)}")
            return False
    
    @classmethod
    def get_task_history(cls, task_id: str) -> list:
        """Get action history for a task"""
        normalized_id = cls.normalize_task_id(task_id)
        redis_key = f"{settings.REDIS_PREFIX}{settings.REDIS_TASK_HISTORY_PREFIX}{normalized_id}"
        
        print(f"Getting task history with Redis key: {redis_key}")
        
        try:
            redis_client = cls.get_redis()
            history_list = redis_client.lrange(redis_key, 0, -1)
            
            print(f"Found {len(history_list)} history entries for task {task_id}")
            
            # Convert string items back to dicts with error handling
            history = []
            for item in history_list:
                try:
                    history.append(json.loads(item))
                except json.JSONDecodeError:
                    # Skip invalid JSON entries
                    print(f"Error decoding history item for task {task_id}")
                    continue
                    
            return history
        except Exception as e:
            print(f"Error retrieving task history: {str(e)}")
            return []
