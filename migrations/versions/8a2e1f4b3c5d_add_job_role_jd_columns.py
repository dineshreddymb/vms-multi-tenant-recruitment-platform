"""add job role jd columns

Revision ID: 8a2e1f4b3c5d
Revises: 79c8b2687259
Create Date: 2026-08-17 12:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8a2e1f4b3c5d'
down_revision: Union[str, Sequence[str], None] = '79c8b2687259'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('job_roles', sa.Column('jd_filename', sa.String(length=255), nullable=True))
    op.add_column('job_roles', sa.Column('jd_file_path', sa.String(length=555), nullable=True))
    op.add_column('job_roles', sa.Column('jd_file_size', sa.Integer(), nullable=True))
    op.add_column('job_roles', sa.Column('jd_content_type', sa.String(length=100), nullable=True))
    op.add_column('job_roles', sa.Column('jd_uploaded_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('job_roles', 'jd_uploaded_at')
    op.drop_column('job_roles', 'jd_content_type')
    op.drop_column('job_roles', 'jd_file_size')
    op.drop_column('job_roles', 'jd_file_path')
    op.drop_column('job_roles', 'jd_filename')
