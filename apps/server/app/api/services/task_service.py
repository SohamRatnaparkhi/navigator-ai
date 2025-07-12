import uuid
from datetime import datetime

from app.api.services.storage_service import StorageService
from app.models.tasks import TaskCreate, TaskResponse


class TaskService:
    """Service for handling tasks"""

    @staticmethod
    def create_task(task: TaskCreate) -> TaskResponse:
        """Create a new task"""
        task_id = f"task_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4()}"

        StorageService.store_task(task_id, task.task)

        return TaskResponse(
            task_id=task_id,
            status="created",
            message=f"Task created successfully: {task.task[:50]}"
        )

    @staticmethod
    def get_task(task_id: str) -> str:
        """Get a task from storage"""
        return StorageService.get_task(task_id)

    @staticmethod
    def get_task_history(task_id: str) -> list:
        """Get task history from storage"""
        return StorageService.get_task_history(task_id)

    @staticmethod
    def get_prev_step_ans(task_id: str) -> str:
        """Get previous step answer for a task"""
        return StorageService.get_prev_step_ans(task_id)
