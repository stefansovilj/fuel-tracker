import type { FillUp } from '../lib/fuelCalc';

interface Props {
  fillUps: FillUp[];
}

export function History({ fillUps }: Props) {
  const rows = [...fillUps].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="card">
      <h2>Fill-up history</h2>
      {rows.length === 0 ? (
        <p className="empty-hint">No fill-ups logged yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Odometer</th>
                <th>Liters</th>
                <th>Distance</th>
                <th>L/100km</th>
                <th>Total price</th>
                <th>Price/L</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id}>
                  <td>{new Date(f.date).toLocaleDateString()}</td>
                  <td>{f.odometer.toLocaleString()}</td>
                  <td>{f.liters}</td>
                  <td>{f.distance ?? '—'}</td>
                  <td>{f.consumption ?? '—'}</td>
                  <td>{f.totalPrice.toLocaleString()}</td>
                  <td>{f.pricePerLiter}</td>
                  <td>{f.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
