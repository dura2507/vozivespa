import { notFound } from "next/navigation";
import { getBikeWithPricing } from "@/lib/bike-pricing";
import BikeDetail from "./BikeDetail";

export const dynamic = "force-dynamic";

export default async function BikeDetailPage({
  params,
}: {
  params: Promise<{ bikeId: string }>;
}) {
  const { bikeId } = await params;
  const bike = await getBikeWithPricing(bikeId);
  if (!bike) notFound();
  return <BikeDetail bike={bike} />;
}
