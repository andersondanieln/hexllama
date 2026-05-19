import React from 'react'
import { Gauge } from 'lucide-react'

export default function BenchmarkView() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Benchmark</h1>
          <p className="page-subtitle">
            Run <code>llama-bench</code> sweeps to measure performance across parameters and compare models
          </p>
        </div>
      </div>
      <div className="empty-state" style={{ padding: '64px 24px' }}>
        <div className="empty-state-icon"><Gauge size={28} /></div>
        <h3>Benchmark runner is coming</h3>
        <p style={{ maxWidth: 520, margin: '0 auto' }}>
          This panel will let you pick a model and a set of parameters to sweep
          (threads, GPU layers, batch size, etc.), then drive <code>llama-bench</code> and
          render the results as a sortable table plus a comparison plot.
        </p>
      </div>
    </div>
  )
}
