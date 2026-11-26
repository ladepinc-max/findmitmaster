import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Briefcase, MapPin } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type PublicJob = {
  id: string; title: string; company: string; description: string; location_name: string;
  job_type: string; salary_amount: number; salary_currency: string; salary_period: string;
  created_at: string; expires_at: string | null;
};

/** Public, indexable job page so each FindMit job can appear on Google and lead back into FindMit Jobs. */
export const Route = createFileRoute("/job/$id")({
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("jobs")
      .select("id, title, company, description, location_name, job_type, salary_amount, salary_currency, salary_period, created_at, expires_at")
      .eq("id", params.id)
      .eq("is_open", true)
      .maybeSingle();
    if (!data) throw notFound();
    return data as PublicJob;
  },
  head: ({ params, loaderData }) => {
    const url = `https://findmit.world/job/${params.id}`;
    const title = loaderData ? `${loaderData.title} at ${loaderData.company} — FindMit Jobs` : "Job — FindMit Jobs";
    const desc = loaderData ? `${loaderData.title} in ${loaderData.location_name}. ${loaderData.description}`.slice(0, 160) : "A job opening on FindMit.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: loaderData
        ? [{
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "JobPosting",
              title: loaderData.title,
              description: loaderData.description,
              datePosted: loaderData.created_at,
              ...(loaderData.expires_at ? { validThrough: loaderData.expires_at } : {}),
              hiringOrganization: { "@type": "Organization", name: loaderData.company },
              jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: loaderData.location_name, addressCountry: "GH" } },
              baseSalary: { "@type": "MonetaryAmount", currency: loaderData.salary_currency, value: { "@type": "QuantitativeValue", value: loaderData.salary_amount, unitText: loaderData.salary_period.toUpperCase() } },
              url,
            }),
          }]
        : [],
    };
  },
  notFoundComponent: () => (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <h1 className="font-display text-xl font-bold">This job is no longer open</h1>
      <Button asChild><Link to="/jobs">See other jobs</Link></Button>
    </main>
  ),
  component: JobPage,
});

function JobPage() {
  const job = Route.useLoaderData();
  return (
    <AppShell>
      <main className="mx-auto max-w-xl space-y-4 px-4 pb-28 pt-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary"><Briefcase className="size-4" /> FindMit Jobs</div>
        <h1 className="font-display text-2xl font-bold">{job.title}</h1>
        <p className="text-sm text-muted-foreground">{job.company} · <MapPin className="inline size-3.5" /> {job.location_name}</p>
        <p className="text-sm font-semibold">{job.salary_currency} {job.salary_amount.toLocaleString()} / {job.salary_period} · {job.job_type}</p>
        <p className="whitespace-pre-line rounded-xl border border-border bg-card p-4 text-sm">{job.description}</p>
        <Button asChild className="w-full"><Link to="/jobs" search={{ q: job.title }}>Apply in FindMit Jobs</Link></Button>
      </main>
    </AppShell>
  );
}
