"""add_submission_reference_to_submissions

Revision ID: 2c5582306634
Revises: c3d4e5f6a7b8
Create Date: 2026-08-21 20:18:30.221047

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2c5582306634'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add submission_reference column allowing NULL initially
    op.add_column('submissions', sa.Column('submission_reference', sa.String(length=100), nullable=True))
    
    # 2. Backfill existing submissions deterministically using SUB-YYYYMMDD-XXXX where XXXX is a daily counter
    # Since we are in PostgreSQL, we can use a query with window functions to calculate day-specific sequence numbers.
    connection = op.get_bind()
    
    # Fetch all existing submissions ordered by created_at to backfill them
    # Format of created_at date part: YYYYMMDD
    # Row number partitioned by date part gives XXXX
    connection.execute(sa.text("""
        WITH numbered_subs AS (
            SELECT 
                id, 
                created_at,
                'SUB-' || to_char(created_at, 'YYYYMMDD') || '-' || lpad(row_number() OVER (PARTITION BY created_at::date ORDER BY created_at, id)::text, 4, '0') AS ref
            FROM submissions
        )
        UPDATE submissions s
        SET submission_reference = ns.ref
        FROM numbered_subs ns
        WHERE s.id = ns.id
    """))

    # 3. Alter column to be nullable=False and add unique constraint
    op.alter_column('submissions', 'submission_reference', nullable=False)
    op.create_unique_constraint('uq_submission_reference', 'submissions', ['submission_reference'])


def downgrade() -> None:
    op.drop_constraint('uq_submission_reference', 'submissions', type_='unique')
    op.drop_column('submissions', 'submission_reference')
