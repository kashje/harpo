import { notFound } from "next/navigation";

import { api } from "@/trpc/server";
import { SharedSecret } from "./_components/shared-secret";

export default async function SharedSecretPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const secret = await api.secret.get({ idToken: id });
  if (!secret) notFound();

  return (
    <section className="pt-28 pb-20 md:pt-32">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl">
          <SharedSecret secret={secret} idToken={id} />
        </div>
      </div>
    </section>
  );
}
