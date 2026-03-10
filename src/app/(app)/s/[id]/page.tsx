import { notFound } from "next/navigation";

import { api, HydrateClient } from "@/trpc/server";
import { SharedSecret } from "./_components/shared-secret";

export default async function SharedSecretPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;

  const secret = await api.secret.get({ id });
  if (!secret) notFound();

  return (
    <HydrateClient>
      <section className="pt-28 pb-20 md:pt-32">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl">
            <SharedSecret id={id} initialName={secret.name} />
          </div>
        </div>
      </section>
    </HydrateClient>
  );
}
