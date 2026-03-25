from sqlalchemy import String, Text, DateTime, Boolean, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from .database import Base
import uuid
from datetime import datetime

def gen_uuid():
    return str(uuid.uuid4())

# ─── 專案 ────────────────────────────────────────────
class Project(Base):
    __tablename__ = "projects"

    id:          Mapped[str]  = mapped_column(String, primary_key=True, default=gen_uuid)
    name:        Mapped[str]  = mapped_column(String(200), nullable=False)
    description: Mapped[str]  = mapped_column(Text, default="")
    tags:        Mapped[str]  = mapped_column(Text, default="[]")   # JSON array
    color:       Mapped[str]  = mapped_column(String(20), default="#6366f1")
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at:  Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:  Mapped[datetime]  = mapped_column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

    messages:      Mapped[list["Message"]]       = relationship("Message",       back_populates="project", cascade="all, delete-orphan")
    files:         Mapped[list["File"]]          = relationship("File",          back_populates="project", cascade="all, delete-orphan")
    tasks:         Mapped[list["Task"]]          = relationship("Task",          back_populates="project", cascade="all, delete-orphan")
    reports:       Mapped[list["Report"]]        = relationship("Report",        back_populates="project", cascade="all, delete-orphan")
    memories:      Mapped[list["ProjectMemory"]] = relationship("ProjectMemory", back_populates="project", cascade="all, delete-orphan")
    presentations: Mapped[list["Presentation"]]  = relationship("Presentation",  back_populates="project", cascade="all, delete-orphan")

# ─── 對話訊息 ─────────────────────────────────────────
class Message(Base):
    __tablename__ = "messages"

    id:         Mapped[str]  = mapped_column(String, primary_key=True, default=gen_uuid)
    project_id: Mapped[str]  = mapped_column(String, ForeignKey("projects.id"))
    role:       Mapped[str]  = mapped_column(String(20))   # user / assistant / system
    content:    Mapped[str]  = mapped_column(Text)
    file_refs:  Mapped[str]  = mapped_column(Text, default="[]")  # 引用的 file id list (JSON)
    created_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship("Project", back_populates="messages")

# ─── 上傳檔案 ─────────────────────────────────────────
class File(Base):
    __tablename__ = "files"

    id:              Mapped[str]  = mapped_column(String, primary_key=True, default=gen_uuid)
    project_id:      Mapped[str]  = mapped_column(String, ForeignKey("projects.id"))
    filename:        Mapped[str]  = mapped_column(String(500))
    original_name:   Mapped[str]  = mapped_column(String(500))
    file_type:       Mapped[str]  = mapped_column(String(50))   # pdf / docx / xlsx / image / txt / pptx
    file_size:       Mapped[int]  = mapped_column(Integer, default=0)
    gemini_file_uri: Mapped[str]  = mapped_column(Text, default="")   # Gemini File API URI
    summary:         Mapped[str]  = mapped_column(Text, default="")   # 自動摘要
    is_indexed:      Mapped[bool] = mapped_column(Boolean, default=False)  # 是否已加入知識庫
    folder_path:     Mapped[str]  = mapped_column(String(500), default="/")  # 資料夾路徑
    created_at:      Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship("Project", back_populates="files")

# ─── 任務 ─────────────────────────────────────────────
class Task(Base):
    __tablename__ = "tasks"

    id:          Mapped[str]  = mapped_column(String, primary_key=True, default=gen_uuid)
    project_id:  Mapped[str]  = mapped_column(String, ForeignKey("projects.id"))
    title:       Mapped[str]  = mapped_column(String(500))
    description: Mapped[str]  = mapped_column(Text, default="")
    status:      Mapped[str]  = mapped_column(String(30), default="todo")  # todo/in_progress/done/archived
    priority:    Mapped[str]  = mapped_column(String(10), default="medium")  # high/medium/low
    assignee:    Mapped[str]  = mapped_column(String(100), default="")
    due_date:    Mapped[str]  = mapped_column(String(30), default="")
    source_msg:  Mapped[str]  = mapped_column(String, default="")  # 產生此任務的 message_id
    created_at:  Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:  Mapped[datetime]  = mapped_column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

    project: Mapped["Project"] = relationship("Project", back_populates="tasks")

# ─── 報告 ─────────────────────────────────────────────
class Report(Base):
    __tablename__ = "reports"

    id:          Mapped[str]  = mapped_column(String, primary_key=True, default=gen_uuid)
    project_id:  Mapped[str]  = mapped_column(String, ForeignKey("projects.id"))
    title:       Mapped[str]  = mapped_column(String(500))
    report_type: Mapped[str]  = mapped_column(String(50))   # progress / meeting / risk / weekly
    content:     Mapped[str]  = mapped_column(Text)
    created_at:  Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship("Project", back_populates="reports")

# ─── Agent 指令記錄 ───────────────────────────────────
class AgentCommand(Base):
    __tablename__ = "agent_commands"

    id:         Mapped[str]  = mapped_column(String, primary_key=True, default=gen_uuid)
    command:    Mapped[str]  = mapped_column(Text)
    status:     Mapped[str]  = mapped_column(String(20), default="pending")  # pending/running/done/error
    result:     Mapped[str]  = mapped_column(Text, default="")
    created_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

# ─── 推播訂閱 ─────────────────────────────────────────
class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id:           Mapped[str]  = mapped_column(String, primary_key=True, default=gen_uuid)
    endpoint:     Mapped[str]  = mapped_column(Text, unique=True)
    p256dh:       Mapped[str]  = mapped_column(Text)
    auth:         Mapped[str]  = mapped_column(Text)
    created_at:   Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())

# ─── 專案記憶 ─────────────────────────────────────────
class ProjectMemory(Base):
    __tablename__ = "project_memories"

    id:         Mapped[str]  = mapped_column(String, primary_key=True, default=gen_uuid)
    project_id: Mapped[str]  = mapped_column(String, ForeignKey("projects.id", ondelete="CASCADE"))
    key:        Mapped[str]  = mapped_column(String(200), nullable=False)   # 記憶的 key（如 "user_preference"）
    value:      Mapped[str]  = mapped_column(Text, nullable=False)           # 記憶的內容
    created_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

    project: Mapped["Project"] = relationship("Project", back_populates="memories")

# ─── 簡報 ────────────────────────────────────────────
class Presentation(Base):
    __tablename__ = "presentations"

    id:         Mapped[str]  = mapped_column(String, primary_key=True, default=gen_uuid)
    project_id: Mapped[str]  = mapped_column(String, ForeignKey("projects.id", ondelete="CASCADE"))
    topic:      Mapped[str]  = mapped_column(String(500), default="")
    title:      Mapped[str]  = mapped_column(String(500))
    subtitle:   Mapped[str]  = mapped_column(Text, default="")
    slides:     Mapped[str]  = mapped_column(Text, default="[]")   # JSON array
    template:   Mapped[str]  = mapped_column(String(50), default="professional")
    created_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

    project: Mapped["Project"] = relationship("Project", back_populates="presentations")

# ─── PPTX QA Job ─────────────────────────────────────
class PptxQAJob(Base):
    __tablename__ = "pptx_qa_jobs"

    id:           Mapped[str]  = mapped_column(String, primary_key=True, default=gen_uuid)
    pres_id:      Mapped[str]  = mapped_column(String, ForeignKey("presentations.id", ondelete="CASCADE"))
    status:       Mapped[str]  = mapped_column(String(20), default="pending")  # pending/running/passed/failed/fixed
    issues_found: Mapped[str]  = mapped_column(Text, default="[]")  # JSON array
    created_at:   Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:   Mapped[datetime]  = mapped_column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
