// /outreach/students — the funnel's actual output: real tutoring requests and
// live SMS conversations. Lives under Campaigns since students are what campaigns
// produce. Relocated from the old "texts" tab; data flow unchanged.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TutoringRequestsPanel } from "@/components/outreach/TutoringRequestsPanel";
import { TextsPanel } from "@/components/outreach/TextsPanel";
import { MOCK_CAMPUSES, type Campus } from "@/lib/outreach-mock";
import { fetchCampuses } from "@/lib/outreach-api";

export const Route = createFileRoute("/outreach/students")({
  head: () => ({ meta: [{ title: "Students — Survive Accounting" }] }),
  component: StudentsPage,
});

function StudentsPage() {
  const campusQuery = useQuery({ queryKey: ["campuses"], queryFn: fetchCampuses, retry: 1 });
  const campuses: Campus[] = campusQuery.data ?? (campusQuery.isError ? MOCK_CAMPUSES : []);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      <Tabs defaultValue="requests" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="conversations">Conversations</TabsTrigger>
        </TabsList>
        <TabsContent value="requests" className="space-y-4">
          <TutoringRequestsPanel />
        </TabsContent>
        <TabsContent value="conversations" className="space-y-4">
          <TextsPanel campuses={campuses} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
