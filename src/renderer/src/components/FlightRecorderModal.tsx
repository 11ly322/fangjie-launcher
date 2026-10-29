import { useEffect, useState } from 'react'
import { Activity, Download, FolderOpen, RefreshCw } from 'lucide-react'
import type { CoreFlightSeries, Instance } from '../../../shared/types'
import { Button, InlineNotice, Modal, Spinner } from './ui'

function average(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function LineChart({
  points,
  color,
  label,
  unit,
  secondary
}: {
  points: Array<[number, number]>
  color: string
  label: string
  unit: string
  secondary?: Array<[number, number]>
}): React.JSX.Element {
  const width = 720
  const height = 210
  const left = 42
  const right = 14
  const top = 18
  const bottom = 30
  const all = [...points, ...(secondary || [])].map(([, value]) => value)
  const max = Math.max(1, ...all) * 1.12
  const maxX = Math.max(1, ...points.map(([x]) => x))
  const toPath = (series: Array<[number, number]>): string =>
    series
      .map(([x, y], index) => {
        const px = left + (x / maxX) * (width - left - right)
        const py = height - bottom - (y / max) * (height - top - bottom)
        return `${index === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`
      })
      .join(' ')
  return (
    <div className="flight-chart">
      <div className="flight-chart__head">
        <span>{label}</span>
        <strong>{unit}</strong>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}折线图`}>
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={left}
            x2={width - right}
            y1={top + (height - top - bottom) * ratio}
            y2={top + (height - top - bottom) * ratio}
            className="flight-grid"
          />
        ))}
        <line
          x1={left}
          x2={width - right}
          y1={height - bottom}
          y2={height - bottom}
          className="flight-axis"
        />
        <text x={4} y={top + 4} className="flight-axis-label">{max.toFixed(0)}</text>
        <text x={4} y={height - bottom + 4} className="flight-axis-label">0</text>
        <text x={left} y={height - 8} className="flight-axis-label">0s</text>
        <text x={width - right - 28} y={height - 8} className="flight-axis-label">
          {maxX.toFixed(0)}s
        </text>
        <path d={toPath(points)} fill="none" stroke={color} strokeWidth="2" />
        {secondary ? (
          <path d={toPath(secondary)} fill="none" stroke="var(--violet)" strokeWidth="1.6" strokeOpacity="0.9" />
        ) : null}
      </svg>
    </div>
  )
}

export function FlightRecorderModal({
  open,
  instance,
  onClose
}: {
  open: boolean
  instance: Instance
  onClose: () => void
}): React.JSX.Element {
  const [data, setData] = useState<CoreFlightSeries | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportNote, setExportNote] = useState('')

  const load = async (): Promise<void> => {
    setLoading(true)
    setError('')
    setExportNote('')
    setData(null)
    const result = await window.fangjie.flightSeries(instance.id)
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setData(result.value)
  }

  useEffect(() => {
    if (open) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, instance.id])

  const samples = data?.samples || []
  const fps = samples.map((sample) => sample.fps)
  const lows = samples.map((sample) => sample.one_percent_low_fps)
  const frame = samples.map((sample) => sample.frame_time_ms)
  const openLogs = async (): Promise<void> => {
    await window.fangjie.openLogsFolder(instance.id)
  }

  const exportCsv = async (): Promise<void> => {
    setExporting(true)
    setExportNote('')
    const result = await window.fangjie.exportFlightCsv(instance.id)
    setExporting(false)
    if (!result.ok) {
      setExportNote(result.error)
      return
    }
    if (result.value) setExportNote('已导出到 ' + result.value)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Flight Recorder"
      description={`读取 ${instance.name} 的 logs/flight-recorder.csv，用于查看帧率与帧时间曲线。`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" icon={<Download size={15} />} loading={exporting} onClick={() => void exportCsv()}>
            导出 CSV
          </Button>
          <Button variant="ghost" icon={<FolderOpen size={15} />} onClick={() => void openLogs()}>
            打开日志目录
          </Button>
          <Button variant="secondary" icon={<RefreshCw size={15} />} loading={loading} onClick={() => void load()}>
            重新读取
          </Button>
          <Button variant="primary" onClick={onClose}>关闭</Button>
        </>
      }
    >
      {exportNote ? (
        <InlineNotice
          tone={exportNote.startsWith('已导出') ? 'success' : 'danger'}
          icon={<Download size={16} />}
          title="CSV 导出"
        >
          {exportNote}
        </InlineNotice>
      ) : null}

      {loading ? (
        <div className="crash-loading">
          <Spinner size={22} />
          <div>
            <strong>正在读取 Flight Recorder</strong>
            <span>CSV 路径：logs/flight-recorder.csv</span>
          </div>
        </div>
      ) : null}

      {!loading && error ? (
        <InlineNotice
          tone="warn"
          icon={<Activity size={18} />}
          title="还没有可读的采样"
          action={
            <Button size="sm" variant="secondary" onClick={() => void openLogs()}>
              打开日志目录
            </Button>
          }
        >
          没有找到 <code>flight-recorder.csv</code>，或文件格式不完整。采样器写入 CSV 后，这里会自动生成 FPS、1% lows 与帧时间曲线。
        </InlineNotice>
      ) : null}

      {!loading && data && samples.length ? (
        <div className="flight-recorder">
          <div className="flight-stats">
            <div><span>平均 FPS</span><strong>{average(fps).toFixed(1)}</strong></div>
            <div><span>最低 1% lows</span><strong>{Math.min(...lows).toFixed(1)}</strong></div>
            <div><span>平均帧时间</span><strong>{average(frame).toFixed(2)} ms</strong></div>
            <div><span>采样点</span><strong>{samples.length}</strong></div>
          </div>
          <LineChart
            points={data.series.fps}
            secondary={data.series.one_percent_low_fps}
            color="var(--accent)"
            label="FPS / 1% lows"
            unit="FPS"
          />
          <LineChart
            points={data.series.frame_time_ms}
            color="var(--warn)"
            label="Frame time"
            unit="ms"
          />
          <div className="flight-legend">
            <span><i className="legend-dot legend-dot--accent" /> FPS</span>
            <span><i className="legend-dot legend-dot--violet" /> 1% lows</span>
            <span><i className="legend-dot legend-dot--warn" /> 帧时间</span>
            <code title={data.path}>{data.path}</code>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
