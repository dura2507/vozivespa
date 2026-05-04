import { redirect } from "next/navigation";
import { CATEGORIES } from "@/lib/mockData";

type SearchParams = Promise<{ bike?: string }>;

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { bike } = await searchParams;
  if (bike && CATEGORIES.some((c) => c.id === bike)) {
    redirect(`/fleet/${bike}`);
  }
  redirect("/#fleet");
}
