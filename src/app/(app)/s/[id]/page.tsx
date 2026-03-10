import { notFound } from "next/navigation";

import { api, HydrateClient } from "@/trpc/server";
import { PasswordGate } from "./_components/password-gate";

export default async function SharedSecretPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const secret = await api.secret.get({ id });
  if (!secret) notFound();

  return (
    <HydrateClient>
      <section className="pt-28 pb-20 md:pt-32">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl">
            <PasswordGate secret={secret} secretIdHash={id} />
          </div>
        </div>
      </section>
    </HydrateClient>
  );
}
