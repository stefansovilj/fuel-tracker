import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { Stats } from '../lib/fuelCalc';

interface Props {
  stats: Stats;
  onExport: () => void;
}

export function Dashboard({ stats, onExport }: Props) {
  return (
    <>
      <div className="card">
        <div className="stats-grid">
          <div className="stat">
            <div className="value">{stats.totalKm ? stats.totalKm.toLocaleString() : '—'}</div>
            <div className="label">Total km</div>
          </div>
          <div className="stat">
            <div className="value">{stats.totalLiters || '—'}</div>
            <div className="label">Total liters</div>
          </div>
          <div className="stat">
            <div className="value">{stats.totalCost ? stats.totalCost.toLocaleString() : '—'}</div>
            <div className="label">Total spent</div>
          </div>
          <div className="stat">
            <div className="value">{stats.avgConsumption ?? '—'}</div>
            <div className="label">Avg L/100km</div>
          </div>
        </div>
        <button type="button" className="secondary" onClick={onExport} disabled={!stats.series.length}>
          Export to Excel
        </button>
      </div>

      <div className="card">
        <h2>Consumption per fill-up (L/100km)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={stats.series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="consumption" stroke="#2b6cff" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h2>Cost per month</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={stats.monthlySeries}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="cost" fill="#2b6cff" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
