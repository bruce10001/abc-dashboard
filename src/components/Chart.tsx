import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

interface ChartProps {
  title: string
  legend: string
  xData: string[]
  yData: number[]
}

function Chart({ title, legend, xData, yData }: ChartProps) {
  const option: EChartsOption = {
    title: {
      text: title,
      left: 'center',
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
      },
    },
    legend: {
      data: [legend],
      top: 30,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: xData,
      axisLabel: {
        rotate: 45,
        fontSize: 10,
      },
    },
    yAxis: {
      type: 'value',
    },
    series: [
      {
        name: legend,
        type: 'bar',
        data: yData,
        itemStyle: {
          color: '#1890ff',
        },
      },
    ],
  }

  return (
    <div className="chart-container">
      <ReactECharts option={option} style={{ height: '400px' }} />
    </div>
  )
}

export default Chart
