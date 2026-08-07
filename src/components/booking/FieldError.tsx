// One reason, under the field it belongs to (Phase 4).
//
// role="alert" so the sentence is announced the moment it appears; the
// validator also moves focus here, so a screen-reader user lands on the
// control the message is about rather than hunting for it.
interface FieldErrorProps {
  id: string;
  message?: string;
}

export default function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p className="ferr" id={id} role="alert">
      {message}
    </p>
  );
}
