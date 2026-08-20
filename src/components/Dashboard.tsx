import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { fixed2, type Stats } from '../lib/fuelCalc';

interface Props {
  stats: Stats;
  onExport: () => void;
  eurRate: number | null;
}

function money(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function Dashboard({ stats, onExport, eurRate }: Props) {
  const totalCostEur = eurRate ? stats.totalCost / eurRate : null;
  const avgMonthlyCostEur = eurRate && stats.avgMonthlyCost !== null ? stats.avgMonthlyCost / eurRate : null;

  return (
    <>
      <div className="card">
        <div className="stats-grid">
          <div className="stat">
            <div className="value">{stats.totalKm ? stats.totalKm.toLocaleString() : '—'}</div>
            <div className="label">Total km</div>
          </div>
          <div className="stat">
            <div className="value">{stats.totalLiters ? fixed2(stats.totalLiters) : '—'}</div>
            <div className="label">Total liters</div>
          </div>
          <div className="stat">
            <div className="value">{stats.totalCost ? money(stats.totalCost) : '—'}</div>
            <div className="label">Total spent (DIN)</div>
          </div>
          <div className="stat">
            <div className="value">{stats.avgConsumption !== null ? fixed2(stats.avgConsumption) : '—'}</div>
            <div className="label">Avg L/100km</div>
          </div>
          <div className="stat">
            <div className="value">{stats.fillUpCount || '—'}</div>
            <div className="label">Fill-ups</div>
          </div>
          <div className="stat">
            <div className="value">{stats.monthsTracked || '—'}</div>
            <div className="label">Months tracked</div>
          </div>
          <div className="stat">
            <div className="value">{stats.avgMonthlyKm !== null ? fixed2(stats.avgMonthlyKm) : '—'}</div>
            <div className="label">Avg monthly km</div>
          </div>
          <div className="stat">
            <div className="value">{stats.avgMonthlyCost !== null ? money(stats.avgMonthlyCost) : '—'}</div>
            <div className="label">Avg monthly cost (DIN)</div>
          </div>
          {totalCostEur !== null && (
            <div className="stat">
              <div className="value">{money(totalCostEur)}</div>
              <div className="label">Total spent (EUR)</div>
            </div>
          )}
          {avgMonthlyCostEur !== null && (
            <div className="stat">
              <div className="value">{money(avgMonthlyCostEur)}</div>
              <div className="label">Avg monthly cost (EUR)</div>
            </div>
          )}
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
            <Tooltip formatter={(value) => fixed2(Number(value))} />
            <Line type="monotone" dataKey="consumption" stroke="#2b6cff" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h2>Cost per month (DIN)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={stats.monthlySeries}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => fixed2(Number(value))} />
            <Bar dataKey="cost" fill="#2b6cff" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h2>Distance per year (km)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={stats.yearlySeries}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="km" fill="#2b6cff" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h2>Cost per year (DIN)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={stats.yearlySeries}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => fixed2(Number(value))} />
            <Bar dataKey="cost" fill="#17752f" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
