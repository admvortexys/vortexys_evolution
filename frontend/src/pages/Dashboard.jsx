import { useEffect, useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Award, BarChart3, Package, RotateCcw, Target, Users, Wallet, Wrench } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { exportBiWorkbook } from '../components/dashboard/exportBiWorkbook'
import { DashboardShell, DashboardTabs, DashboardToolbar, AnalyticsSkeleton } from '../components/dashboard/primitives'
import { formatBiPeriodLabel, toYMD } from '../components/dashboard/biTheme'
import OverviewTab from '../components/dashboard/tabs/OverviewTab'
import FinanceTab from '../components/dashboard/tabs/FinanceTab'
import SalesTab from '../components/dashboard/tabs/SalesTab'
import ProductsTab from '../components/dashboard/tabs/ProductsTab'
import ClientsTab from '../components/dashboard/tabs/ClientsTab'
import CrmTab from '../components/dashboard/tabs/CrmTab'
import ServiceTab from '../components/dashboard/tabs/ServiceTab'
import ReturnsTab from '../components/dashboard/tabs/ReturnsTab'

function getInitialTab(searchParams) {
  const value = searchParams.get('tab')
  if (value === 'relatorios' || value === 'crm') return 'crm'
  return value || 'geral'
}

export default function Dashboard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  const today = new Date()

  const [filterMode, setFilterMode] = useState('month')
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [year, setYear] = useState(today.getFullYear())
  const [singleDate, setSingleDate] = useState(toYMD(today))
  const [startDate, setStartDate] = useState(toYMD(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [endDate, setEndDate] = useState(toYMD(today))
  const [tab, setTab] = useState(getInitialTab(searchParams))
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [biSellers, setBiSellers] = useState(null)
  const [biProducts, setBiProducts] = useState(null)
  const [biClients, setBiClients] = useState(null)
  const [biCrm, setBiCrm] = useState(null)
  const [biFinance, setBiFinance] = useState(null)
  const [biServiceOrders, setBiServiceOrders] = useState(null)
  const [biReturns, setBiReturns] = useState(null)
  const [selSeller, setSelSeller] = useState('')
  const [serviceOrdersLoading, setServiceOrdersLoading] = useState(false)
  const [serviceOrdersError, setServiceOrdersError] = useState('')

  const apiParams = useMemo(() => {
    if (filterMode === 'date') return { date: singleDate }
    if (filterMode === 'period') return { start_date: startDate, end_date: endDate }
    return { month, year }
  }, [filterMode, month, year, singleDate, startDate, endDate])

  const goToday = useCallback(() => {
    setMonth(today.getMonth() + 1)
    setYear(today.getFullYear())
    setSingleDate(toYMD(today))
    setStartDate(toYMD(new Date(today.getFullYear(), today.getMonth(), 1)))
    setEndDate(toYMD(today))
  }, [today])

  const loadMain = useCallback(async () => {
    setLoading(true)
    try {
      const { data: response } = await api.get('/dashboard', { params: apiParams })
      setData(response)
    } catch {
      toast.error('Erro ao carregar BI')
    }
    setLoading(false)
  }, [apiParams, toast])

  const loadSellers = useCallback(async () => {
    try {
      const { data: response } = await api.get('/dashboard/bi/sellers', {
        params: { ...apiParams, seller_id: selSeller || undefined },
      })
      setBiSellers(response)
    } catch {
      setBiSellers(null)
    }
  }, [apiParams, selSeller])

  const loadProducts = useCallback(async () => {
    try {
      const { data: response } = await api.get('/dashboard/bi/products', { params: apiParams })
      setBiProducts(response)
    } catch {
      setBiProducts(null)
    }
  }, [apiParams])

  const loadClients = useCallback(async () => {
    try {
      const { data: response } = await api.get('/dashboard/bi/clients', { params: apiParams })
      setBiClients(response)
    } catch {
      setBiClients(null)
    }
  }, [apiParams])

  const loadCrm = useCallback(async () => {
    try {
      const { data: response } = await api.get('/dashboard/bi/crm', { params: apiParams })
      setBiCrm(response)
    } catch {
      setBiCrm(null)
    }
  }, [apiParams])

  const loadFinance = useCallback(async () => {
    try {
      const [summary, evolution, byCat, transactions, incomeSources] = await Promise.all([
        api.get('/transactions/summary', { params: apiParams }),
        api.get('/transactions/monthly-evolution'),
        api.get('/transactions/by-category', { params: apiParams }),
        api.get('/transactions', { params: apiParams }),
        api.get('/transactions/income-sources', { params: apiParams }),
      ])
      setBiFinance({
        summary: summary.data,
        evolution: evolution.data,
        byCat: byCat.data,
        transactions: transactions.data,
        incomeSources: incomeSources.data,
      })
    } catch {
      setBiFinance(null)
    }
  }, [apiParams])

  const loadServiceOrders = useCallback(async () => {
    setServiceOrdersLoading(true)
    setServiceOrdersError('')
    try {
      const { data: response } = await api.get('/dashboard/bi/service-orders', { params: apiParams })
      setBiServiceOrders(response)
    } catch (error) {
      setBiServiceOrders(null)
      setServiceOrdersError(error.response?.data?.error || 'Nao foi possivel carregar os dados de assistencia.')
      toast.error(error.response?.data?.error || 'Erro ao carregar assistencia')
    }
    setServiceOrdersLoading(false)
  }, [apiParams, toast])

  const loadReturns = useCallback(async () => {
    try {
      const { data: response } = await api.get('/dashboard/bi/returns', { params: apiParams })
      setBiReturns(response)
    } catch {
      setBiReturns(null)
    }
  }, [apiParams])

  const refreshAll = useCallback(() => {
    loadMain()
    if (tab === 'financeiro') loadFinance()
    else if (tab === 'vendedores') loadSellers()
    else if (tab === 'produtos') loadProducts()
    else if (tab === 'clientes') loadClients()
    else if (tab === 'crm') loadCrm()
    else if (tab === 'assistencia') loadServiceOrders()
    else if (tab === 'devolucoes') loadReturns()
  }, [tab, loadMain, loadFinance, loadSellers, loadProducts, loadClients, loadCrm, loadServiceOrders, loadReturns])

  useEffect(() => { loadMain() }, [loadMain])
  useEffect(() => { if (tab === 'vendedores') loadSellers() }, [tab, loadSellers])
  useEffect(() => {
    if (tab === 'vendedores' && biSellers?.ranking?.length && !selSeller) {
      setSelSeller(String(biSellers.ranking[0].id))
    }
  }, [tab, biSellers, selSeller])
  useEffect(() => { if (tab === 'vendedores' && selSeller) loadSellers() }, [tab, selSeller, loadSellers])
  useEffect(() => { if (tab === 'produtos') loadProducts() }, [tab, loadProducts])
  useEffect(() => { if (tab === 'clientes') loadClients() }, [tab, loadClients])
  useEffect(() => { if (tab === 'crm') loadCrm() }, [tab, loadCrm])
  useEffect(() => { if (tab === 'financeiro') loadFinance() }, [tab, loadFinance])
  useEffect(() => { if (tab === 'assistencia') loadServiceOrders() }, [tab, loadServiceOrders])
  useEffect(() => { if (tab === 'devolucoes') loadReturns() }, [tab, loadReturns])

  const chartData = useMemo(() => {
    if (!data?.revenueByMonth) return []
    return data.revenueByMonth.map(item => ({
      label: item.month,
      value: parseFloat(item.revenue) || 0,
    }))
  }, [data])

  const periodLabel = useMemo(() => formatBiPeriodLabel(filterMode, {
    month, year, singleDate, startDate, endDate,
  }), [filterMode, month, year, singleDate, startDate, endDate])

  const firstName = user?.name?.split(' ')[0] ?? 'usuario'
  const hour = today.getHours()
  const greeting = `${hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'}, ${firstName}`

  const allData = { data, biFinance, biSellers, biProducts, biClients, biCrm, biServiceOrders, biReturns, chartData }
  const tabs = [
    { k: 'geral', l: 'Geral', icon: BarChart3 },
    { k: 'financeiro', l: 'Financeiro', icon: Wallet },
    { k: 'vendedores', l: 'Vendas', icon: Award },
    { k: 'produtos', l: 'Produtos', icon: Package },
    { k: 'clientes', l: 'Clientes', icon: Users },
    { k: 'crm', l: 'CRM', icon: Target },
    { k: 'assistencia', l: 'Assistencia', icon: Wrench },
    { k: 'devolucoes', l: 'Devolucoes', icon: RotateCcw },
  ]

  let content = null
  if (loading && !data) {
    content = <AnalyticsSkeleton />
  } else if (tab === 'geral') {
    content = <OverviewTab data={data} />
  } else if (tab === 'financeiro') {
    content = <FinanceTab data={biFinance} />
  } else if (tab === 'vendedores') {
    content = <SalesTab data={biSellers} selSeller={selSeller} setSelSeller={setSelSeller} loadSellers={loadSellers} />
  } else if (tab === 'produtos') {
    content = <ProductsTab data={biProducts} />
  } else if (tab === 'clientes') {
    content = <ClientsTab data={biClients} />
  } else if (tab === 'crm') {
    content = <CrmTab data={biCrm} />
  } else if (tab === 'assistencia') {
    content = <ServiceTab data={biServiceOrders} loading={serviceOrdersLoading} error={serviceOrdersError} onRetry={loadServiceOrders} />
  } else if (tab === 'devolucoes') {
    content = <ReturnsTab data={biReturns} />
  }

  return (
    <DashboardShell
      greeting={greeting}
      subtitle=""
      periodLabel={periodLabel}
      toolbar={(
        <DashboardToolbar
          filterMode={filterMode}
          setFilterMode={setFilterMode}
          month={month}
          setMonth={setMonth}
          year={year}
          setYear={setYear}
          singleDate={singleDate}
          setSingleDate={setSingleDate}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          onRefresh={refreshAll}
          onToday={goToday}
          onExport={() => exportBiWorkbook(tab, allData)}
        />
      )}
      tabs={<DashboardTabs tabs={tabs} active={tab} onChange={setTab} />}
    >
      {content}
    </DashboardShell>
  )
}
