import { DeleteSecret } from "./_components/delete-secret";

export default async function DeleteSecretPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <section className="pt-28 pb-20 md:pt-32">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl">
          <DeleteSecret idToken={id} />
        </div>
      </div>
    </section>
  );
}
