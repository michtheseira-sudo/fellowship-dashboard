export default function DataError({ message }: { message: string }) {
  return (
    <div className="border border-danger bg-danger-pastel p-5 text-sm text-ink">
      <div className="font-medium text-danger mb-1">Couldn&rsquo;t load this data</div>
      <div>{message}</div>
    </div>
  );
}
