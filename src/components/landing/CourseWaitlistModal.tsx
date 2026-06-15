// Course-level waitlist + syllabus upload. Public form on the campus landing page.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitCourseWaitlist, type CourseFamily } from "@/lib/outreach-api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campusId: string;
  schoolName: string;
  family: CourseFamily;
  familyLabel: string;
  courseCode?: string | null;
}

export default function CourseWaitlistModal({
  open, onOpenChange, campusId, schoolName, family, familyLabel, courseCode,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => {
    setName(""); setEmail(""); setPhone(""); setNotes(""); setFile(null); setDone(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Please enter a valid email.");
      return;
    }
    if (file && file.size > 10 * 1024 * 1024) {
      toast.error("Syllabus is too large (10MB max).");
      return;
    }
    setBusy(true);
    try {
      await submitCourseWaitlist({
        campus_id: campusId,
        course_family: family,
        name, email, phone,
        school: schoolName,
        course: courseCode ?? null,
        notes,
        syllabus_file: file,
      });
      setDone(true);
      toast.success("You're on the waitlist — Lee will be in touch.");
    } catch (err: any) {
      toast.error(err?.message ?? "Submission failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Join the {familyLabel} waitlist</DialogTitle>
          <DialogDescription>
            {schoolName}{courseCode ? ` · ${courseCode}` : ""}. Upload your syllabus to help Lee prep faster.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-3 text-sm">
            <p>You're on the list — Lee will reach out by email or text when a spot opens up.</p>
            <Button className="w-full" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cwm-name" className="text-xs">Name</Label>
              <Input id="cwm-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cwm-email" className="text-xs">Email</Label>
              <Input id="cwm-email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cwm-phone" className="text-xs">Phone <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="cwm-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-5555" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cwm-syllabus" className="text-xs">Syllabus <span className="text-muted-foreground">(PDF, optional)</span></Label>
              <Input
                id="cwm-syllabus"
                type="file"
                accept=".pdf,.doc,.docx,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cwm-notes" className="text-xs">Notes <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                id="cwm-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything Lee should know — textbook, exam dates, professor…"
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "Sending…" : "Join Waitlist"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
