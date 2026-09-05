import pytest
from database import get_db, init_db
from bot_manager import BotManager

def test_stale_pid_self_healing():
    init_db()
    manager = BotManager()
    conn = get_db()
    c = conn.cursor()
    
    # Insert or update a dummy bot with a foreign/stale PID (e.g. PID 999999) marked as RUNNING
    c.execute("""
        INSERT INTO bot_instances (name, algo_path, account_id, symbol, timeframe, status, pid)
        VALUES ('Test Stale Bot', 'Dummy.algo', '8246991', 'EURUSD', 'm15', 'RUNNING', 999999)
    """)
    bot_id = c.lastrowid
    conn.commit()
    conn.close()

    try:
        # 1. Verify is_process_running returns False for stale PID
        assert manager.is_process_running(999999) is False
        
        # 2. Test stop_bot on stale PID -> should succeed with self-healing message and set DB to STOPPED
        success, msg = manager.stop_bot(bot_id)
        assert success is True
        assert "STOPPED" in msg
        
        # 3. Verify status in database is now STOPPED and pid is NULL
        conn = get_db()
        c = conn.cursor()
        c.execute("SELECT status, pid FROM bot_instances WHERE id = ?", (bot_id,))
        row = dict(c.fetchone())
        assert row["status"] == "STOPPED"
        assert row["pid"] is None

        # 4. Set it back to RUNNING with a system PID (e.g. PID 4 on Windows)
        c.execute("UPDATE bot_instances SET status = 'RUNNING', pid = 4 WHERE id = ?", (bot_id,))
        conn.commit()
        
        # 5. Run sync_stale_processes() -> should automatically heal it back to STOPPED
        manager.sync_stale_processes()
        c.execute("SELECT status, pid FROM bot_instances WHERE id = ?", (bot_id,))
        row2 = dict(c.fetchone())
        assert row2["status"] == "STOPPED"
        assert row2["pid"] is None
        conn.close()
    finally:
        # Cleanup test bot
        conn = get_db()
        c = conn.cursor()
        c.execute("DELETE FROM bot_instances WHERE id = ?", (bot_id,))
        conn.commit()
        conn.close()
