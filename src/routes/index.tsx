import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, ArrowRight, BookOpen, Users, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Survive Accounting — Pass Your Accounting Exams" },
      {
        name: "description",
        content:
          "1-on-1 tutoring and exam-ready CEQ practice for accounting students. Built by students who've been there.",
      },
      { property: "og:title", content: "Survive Accounting" },
      {
        property: "og:description",
        content: "1-on-1 tutoring and exam-ready CEQ practice for accounting students.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="size-8 rounded-md bg-primary text-primary-foreground grid place-items-center font-display text-lg">
              S
            </div>
            <span className="font-display text-xl">Survive Accounting</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#tutoring">Tutoring</a>
            <a href="#ceq">CEQ Prep</a>
            <a href="#about">About</a>
            <Link to="/outreach" className="text-foreground/60 hover:text-foreground">
              Team
            </Link>
          </nav>
          <Button asChild>
            <a href="#tutoring">Book a session</a>
          </Button>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-6">
            <Sparkles className="size-3.5" /> For accounting students
          </div>
          <h1 className="font-display text-5xl sm:text-7xl leading-[1.05] text-foreground">
            Survive your next accounting exam — and actually understand it.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            1-on-1 tutoring with top students, plus a CEQ practice engine built around how
            your professors actually test. No fluff, no $400 review courses.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <a href="#tutoring">
                Get tutoring <ArrowRight className="ml-1 size-4" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#ceq">Try CEQ practice</a>
            </Button>
          </div>
        </div>
      </section>

      <section id="tutoring" className="border-t bg-card">
        <div className="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <Users className="size-5 text-primary" />
              <CardTitle className="font-display text-2xl mt-2">1-on-1 Tutoring</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p className="flex gap-2"><Check className="size-4 text-primary mt-0.5" /> Matched to your course & professor</p>
              <p className="flex gap-2"><Check className="size-4 text-primary mt-0.5" /> Flexible scheduling around exams</p>
              <p className="flex gap-2"><Check className="size-4 text-primary mt-0.5" /> Tutors who earned A's in the same class</p>
            </CardContent>
          </Card>
          <Card id="ceq">
            <CardHeader>
              <BookOpen className="size-5 text-primary" />
              <CardTitle className="font-display text-2xl mt-2">CEQ Practice</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p className="flex gap-2"><Check className="size-4 text-primary mt-0.5" /> Exam-style conceptual questions</p>
              <p className="flex gap-2"><Check className="size-4 text-primary mt-0.5" /> Step-by-step worked solutions</p>
              <p className="flex gap-2"><Check className="size-4 text-primary mt-0.5" /> Built by students, for students</p>
            </CardContent>
          </Card>
          <Card id="about">
            <CardHeader>
              <Sparkles className="size-5 text-primary" />
              <CardTitle className="font-display text-2xl mt-2">Built on campus</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Started by accounting majors who got tired of expensive prep that didn't match
              what was on the test. We talk to students in real classrooms every week.
            </CardContent>
          </Card>
        </div>
      </section>

      <footer className="border-t">
        <div className="max-w-6xl mx-auto px-6 py-8 text-sm text-muted-foreground flex justify-between">
          <span>© {new Date().getFullYear()} Survive Accounting</span>
          <Link to="/outreach" className="hover:text-foreground">Team login</Link>
        </div>
      </footer>
    </div>
  );
}
