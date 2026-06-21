"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";

interface AgentModalProps {
  open: boolean;
  onClose: () => void;
  macroId: number | null;
  onRun: (macroId: number, agent: string) => void;
}

export function AgentModal({ open, onClose, macroId, onRun }: AgentModalProps) {
  const [agents, setAgents] = useState<string[]>([]);
  const [selected, setSelected] = useState("");

  const handleClose = () => {
    setSelected("");
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    fetch("/api/agents/options")
      .then((r) => r.json())
      .then((data: { id: number; hostname: string }[]) => {
        setAgents(data.map((a) => a.hostname));
      })
      .catch(() => setAgents([]));
  }, [open]);

  const handleRun = () => {
    if (macroId && selected) {
      onRun(macroId, selected);
      handleClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Select Agent"
      icon="dns"
      actions={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors rounded-none"
          >
            Cancel
          </button>
          <button
            onClick={handleRun}
            disabled={!selected}
            className="px-4 py-2 text-xs font-semibold bg-gradient-to-br from-primary-fixed to-primary text-on-primary rounded-none disabled:opacity-50"
          >
            Run
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-on-surface-variant">
        Select an agent to run this macro on.
      </p>
      <div className="relative">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full bg-surface-container-high border-b-2 border-outline-variant text-on-surface py-2.5 px-3 text-sm font-medium transition-colors focus:border-primary outline-none rounded-none"
          style={{
            appearance: "none",
            backgroundImage: `url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22%23849587%22 viewBox=%220 0 16 16%22%3E%3Cpath d=%22M4 6l4 4 4-4%22/%3E%3C/svg%3E')`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 0.75rem center",
            backgroundSize: "16px",
            paddingRight: "2.5rem",
          }}
        >
          <option disabled value="">
            Pick an agent
          </option>
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
          {agents.length === 0 && <option disabled>No agents connected</option>}
        </select>
      </div>
    </Modal>
  );
}
