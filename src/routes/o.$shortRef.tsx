// /o/{short_ref} — Onboarding entry point for students who texted Lee.
// Resolves the SMS short_ref to a linked student_intake_submissions row and
// collects name + email. Phone is already known from the SMS thread.
import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Toaster, toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getOnboarding, saveOnboardingContact } from "@/lib/onboarding.functions";

const NAVY = "#14213D";
const RED = "#CE1126";

const onboardingQuery = (shortRef: string) =>
  queryOptions({
    queryKey: ["onboarding", shortRef],
    queryFn: () => getOnboarding({ data: { shortRef: Number(shortRef) } }),
  });

export const Route = createFileRoute("/o/$shortRef")({
  head: () => ({
    meta: [
      { title: "Continue your tutoring request — Survive Accounting" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(onboardingQuery(params.shortRef)),
  component: OnboardingPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold" style={{ color: NAVY }}>
          We couldn't find that link.
        </h1>
        <p className="mt-2 text-sm text-gray-600">{error.message}</p>
        <Button
          className="mt-4"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          Try again
        </Button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="mx-auto max-w-md p-6 text-center">
      <h1 className="text-lg font-semibold" style={{ color: NAVY }}>
        Link not found.
      </h1>
    </div>
  ),
});

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Valid email is required").max(255),
});

function OnboardingPage() {
  const { shortRef } = Route.useParams();
  const { data, refetch } = useSuspenseQuery(onboardingQuery(shortRef));
  const saveFn = useServerFn(saveOnboardingContact);

  const [name, setName] = useState(
    [data.firstName, data.lastName].filter(Boolean).join(" "),
  );
  const [email, setEmail] = useState(data.email ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (input: { name: string; email: string }) =>
      saveFn({ data: { shortRef: Number(shortRef), ...input } }),
    onSuccess: () => {
      toast.success("Thanks — Lee will be in touch shortly.");
      refetch();
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const submit = () => {
    const parsed = contactSchema.safeParse({ name, email });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0] as string;
        if (k && !errs[k]) errs[k] = i.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data);
  };

  const done = !!data.requiredOnboardingCompletedAt;

  return (
    <div className="min-h-screen" style={{ background: "#F5F7FA", fontFamily: "Inter, sans-serif" }}>
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          {done && !mutation.isPending ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <h1 className="mt-4 text-xl font-bold sm:text-2xl" style={{ color: NAVY }}>
                You're all set.
              </h1>
              <p className="mt-3 text-sm text-gray-700">
                Lee has your info and will text you back shortly.
              </p>
              {data.campus || data.course ? (
                <p className="mt-2 text-xs text-gray-500">
                  {[data.campus, data.course].filter(Boolean).join(" • ")}
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold sm:text-2xl" style={{ color: NAVY }}>
                Continue your tutoring request
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                Quick info so Lee knows who he's texting with.
              </p>

              <div className="mt-6 space-y-4">
                <div>
                  <Label className="mb-1.5 block text-sm font-medium text-gray-800">
                    Name <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                  {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
                </div>

                <div>
                  <Label className="mb-1.5 block text-sm font-medium text-gray-800">
                    Email <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                  {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
                </div>

                <Button
                  onClick={submit}
                  disabled={mutation.isPending}
                  className="h-12 w-full text-base font-bold text-white"
                  style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}
                >
                  {mutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
      <Toaster position="top-center" richColors />
    </div>
  );
}
