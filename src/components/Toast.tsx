interface Props {
  message: string;
  type: 'info' | 'success' | 'error';
  onDismiss: () => void;
}

export function Toast({ message, type, onDismiss }: Props) {
  return (
    <div className={`toast ${type}`} role="status">
      <span>{message}</span>
      <button type="button" className="toast-close" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
