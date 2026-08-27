from abc import ABC, abstractmethod
from uuid import UUID
from sqlalchemy.orm import Session
from db.models import Resume

class QueueBroker(ABC):
    @abstractmethod
    def enqueue_resume_job(self, resume_id: UUID, db: Session) -> None:
        """
        Add a Resume job to the queue.
        """
        pass

    @abstractmethod
    def dequeue_resume_job(self, db: Session) -> UUID:
        """
        Lock and retrieve the next pending Resume job from the queue.
        """
        pass

class DbQueueBroker(QueueBroker):
    def enqueue_resume_job(self, resume_id: UUID, db: Session) -> None:
        """
        Enqueues by setting processing states to PENDING in the DB.
        """
        resume = db.query(Resume).filter(Resume.id == resume_id).first()
        if resume:
            resume.processing_state = "PENDING"
            resume.eligibility_state = "PENDING"
            db.commit()

    def dequeue_resume_job(self, db: Session) -> UUID:
        """
        Uses SELECT FOR UPDATE SKIP LOCKED to concurrently dequeue next resume.
        Locks the record, changes state to PROCESSING, and returns its ID.
        """
        resume = db.query(Resume).filter(
            Resume.processing_state == "PENDING"
        ).with_for_update(skip_locked=True).first()
        
        if resume:
            resume.processing_state = "PROCESSING"
            db.commit()
            return resume.id
        return None
