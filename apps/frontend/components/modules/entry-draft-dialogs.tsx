"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type EntryDraftLeaveDialogProps = {
  open: boolean;
  title: string;
  description: string;
  saving: boolean;
  /** Close dialog and keep editing (Stay, Esc, overlay). */
  onStay: () => void;
  onDiscard: () => void;
  onSaveDraft: () => void;
};

/** Save / discard / cancel when leaving an entry workspace with unsaved edits (matches console UI, not window.confirm). */
export function EntryDraftLeaveDialog({
  open,
  title,
  description,
  saving,
  onStay,
  onDiscard,
  onSaveDraft,
}: EntryDraftLeaveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onStay()}>
      <DialogContent
        showCloseButton={false}
        className="border-[#59786f] bg-[#fbfcf7] font-mono sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          onStay();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-[#1a3329]">{title}</DialogTitle>
          <DialogDescription className="text-[#5b655f]">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" className="border-[#59786f]" disabled={saving} onClick={onStay}>
            Stay
          </Button>
          <Button type="button" variant="secondary" disabled={saving} onClick={onDiscard}>
            Discard
          </Button>
          <Button
            type="button"
            className="bg-[#2f5d50] text-white hover:bg-[#2f5d50]/90"
            disabled={saving}
            onClick={onSaveDraft}
          >
            {saving ? "Saving…" : "Save draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type EntryDraftResumeDialogProps = {
  open: boolean;
  documentLabel: string;
  updatedAtLabel: string;
  onResume: () => void;
  onStartFresh: () => void;
};

export function EntryDraftResumeDialog({
  open,
  documentLabel,
  updatedAtLabel,
  onResume,
  onStartFresh,
}: EntryDraftResumeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="border-[#59786f] bg-[#fbfcf7] font-mono sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-[#1a3329]">Resume draft?</DialogTitle>
          <DialogDescription className="text-[#5b655f]">
            You have a saved {documentLabel} draft{updatedAtLabel ? ` (${updatedAtLabel})` : ""}. Continue where you left off or start fresh.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" className="border-[#59786f]" onClick={onStartFresh}>
            Start fresh
          </Button>
          <Button type="button" className="bg-[#2f5d50] text-white hover:bg-[#2f5d50]/90" onClick={onResume}>
            Resume draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
