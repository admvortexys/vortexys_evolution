import {
  ArrowRightLeft,
  Boxes,
  ClipboardList,
  Filter,
  Package,
  PackageSearch,
  Plus,
  ScanSearch,
  ShieldAlert,
  Smartphone,
  Store,
  TrendingDown,
  TrendingUp,
  Wallet,
  Warehouse,
} from 'lucide-react'
import { Badge, Btn, Input, Select, Spinner, Table, fmt } from '../UI'
import { ChartCard, EmptyAnalyticsState, MetricCard, SectionHeading } from '../dashboard/primitives'

export const STOCK_TABS = [
  { k: 'overview', l: 'Visão geral', icon: Boxes },
  { k: 'position', l: 'Posição', icon: Package },
  { k: 'kardex', l: 'Movimentações', icon: ClipboardList },
  { k: 'imei', l: 'IMEI / Seriais', icon: Smartphone },
  { k: 'inventory', l: 'Inventário', icon: ScanSearch },
  { k: 'transfers', l: 'Transferências', icon: ArrowRightLeft },
]

function ActionTile({ icon: Icon, title, description, cta, onClick }) {
  return (
    <button className="stock-action-tile" onClick={onClick}>
      <div className="stock-action-tile__icon">
        <Icon size={18} />
      </div>
      <div className="stock-action-tile__copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <span className="stock-action-tile__cta">{cta}</span>
    </button>
  )
}

function SearchField({ value, onChange, placeholder, mono = false, autoFocus = false }) {
  return (
    <Input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      prefix={<PackageSearch size={16} />}
      autoFocus={autoFocus}
      style={mono ? { fontFamily: 'monospace' } : undefined}
    />
  )
}

function SearchResults({ results, onSelect }) {
  if (!results.length) return null
  return (
    <div className="stock-search-results">
      {results.map((item) => (
        <button key={item.id} className="stock-search-result" onClick={() => onSelect(item)}>
          <div className="stock-search-result__media">
            {item.image_base64 ? (
              <img src={item.image_base64} alt="" />
            ) : (
              <Package size={18} />
            )}
          </div>
          <div className="stock-search-result__copy">
            <strong>{item.name}</strong>
            <span>
              SKU: {item.sku}
              {item.brand ? ` · ${item.brand}` : ''}
              {item.model ? ` ${item.model}` : ''}
              {item.barcode ? ` · ${item.barcode}` : ''}
            </span>
          </div>
          <div className="stock-search-result__value">
            {fmt.num(item.stock_quantity)} {item.unit}
          </div>
        </button>
      ))}
    </div>
  )
}

export function StockToolbar({
  tab,
  warehouses,
  warehouseId,
  onWarehouseChange,
  showFilters,
  onToggleFilters,
  onOpenImei,
  onOpenMovement,
  onOpenInventory,
  onOpenTransfer,
  onOpenDeposits,
  onRefresh,
}) {
  return (
    <div className="stock-toolbar">
      <div className="stock-toolbar__group">
        <button className="bi-action-btn" onClick={onOpenDeposits} type="button">
          <Store size={14} />
          Depósitos
        </button>
        <button className="bi-action-btn" onClick={onOpenMovement} type="button">
          <Plus size={14} />
          Movimentar
        </button>
        <button className="bi-action-btn" onClick={onOpenTransfer}>
          <ArrowRightLeft size={14} />
          Transferir
        </button>
        <button className="bi-action-btn" onClick={onOpenInventory}>
          <ScanSearch size={14} />
          Inventariar
        </button>
        <button className="bi-action-btn" onClick={onOpenImei}>
          <Smartphone size={14} />
          Buscar IMEI
        </button>
      </div>

      <div className="stock-toolbar__group">
        <div className="stock-toolbar__field">
          <Select value={warehouseId} onChange={(e) => onWarehouseChange(e.target.value)}>
            <option value="">Todos os depósitos</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
            ))}
          </Select>
        </div>
        {tab === 'kardex' && (
          <button className={`bi-action-btn${showFilters ? ' bi-action-btn--primary' : ''}`} onClick={onToggleFilters}>
            <Filter size={14} />
            {showFilters ? 'Ocultar filtros' : 'Filtros'}
          </button>
        )}
        <button className="bi-action-btn" onClick={onRefresh}>
          Atualizar
        </button>
      </div>
    </div>
  )
}

export function StockOverviewTab({
  overview,
  onGoPosition,
  onGoKardex,
  onOpenMovement,
  onOpenInventory,
  onOpenTransfer,
  onOpenImei,
}) {
  const cards = [
    { icon: Boxes, label: 'Produtos ativos', value: fmt.num(overview?.products_active ?? 0), sub: 'Itens com saldo monitorado', color: '#8b5cf6' },
    { icon: ShieldAlert, label: 'Estoque baixo', value: fmt.num(overview?.low_stock ?? 0), sub: 'Produtos pedindo reposição', color: '#f59e0b' },
    { icon: PackageSearch, label: 'Sem estoque', value: fmt.num(overview?.no_stock ?? 0), sub: 'Produtos zerados', color: '#ef4444' },
    { icon: TrendingUp, label: 'Entradas hoje', value: fmt.num(overview?.movements_today?.in ?? 0), sub: 'Movimentos de entrada no dia', color: '#22c55e' },
    { icon: TrendingDown, label: 'Saídas hoje', value: fmt.num(overview?.movements_today?.out ?? 0), sub: 'Movimentos de saída no dia', color: '#06b6d4' },
    { icon: Wallet, label: 'Valor em estoque', value: fmt.brl(overview?.value_total ?? 0), sub: 'Valorização total da operação', color: '#10b981' },
  ]

  const quickActions = [
    { icon: Package, title: 'Posição por produto', description: 'Consulte saldo, disponibilidade e custo médio por depósito.', cta: 'Abrir posição', onClick: onGoPosition },
    { icon: ClipboardList, title: 'Kardex operacional', description: 'Rastreie entradas, saídas e ajustes com histórico detalhado.', cta: 'Ver movimentações', onClick: onGoKardex },
    { icon: ScanSearch, title: 'Novo inventário', description: 'Registre contagens e gere ajustes automáticos com motivo.', cta: 'Iniciar inventário', onClick: onOpenInventory },
    { icon: Smartphone, title: 'Busca de IMEI', description: 'Rastreie rapidamente unidades por IMEI ou número serial.', cta: 'Rastrear unidade', onClick: onOpenImei },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHeading
        title="Operação em tempo real"
        description="Resumo executivo do estoque com acesso rápido aos fluxos mais usados pela equipe."
        action={<Btn onClick={onOpenMovement}>Nova movimentação</Btn>}
      />

      <div className="bi-metric-grid">
        {cards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </div>

      <div className="bi-grid bi-grid--crm-top">
        <ChartCard
          title="Atalhos operacionais"
          subtitle="Ações principais organizadas para reduzir cliques e acelerar a rotina."
          footer={<Btn variant="ghost" onClick={onOpenTransfer}>Abrir transferência</Btn>}
        >
          <div className="stock-action-grid">
            {quickActions.map((action) => (
              <ActionTile key={action.title} {...action} />
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Pulso do estoque" subtitle="Indicadores críticos para priorizar conferência, compra e movimentação.">
          <div className="stock-summary-list">
            <div className="stock-summary-list__row">
              <span>Reservados</span>
              <strong>{fmt.num(overview?.reserved_units ?? 0)}</strong>
            </div>
            <div className="stock-summary-list__row">
              <span>Itens com baixo estoque</span>
              <strong>{fmt.num(overview?.low_stock ?? 0)}</strong>
            </div>
            <div className="stock-summary-list__row">
              <span>Itens zerados</span>
              <strong>{fmt.num(overview?.no_stock ?? 0)}</strong>
            </div>
            <div className="stock-summary-list__row">
              <span>Entradas x saídas hoje</span>
              <strong>{fmt.num(overview?.movements_today?.in ?? 0)} / {fmt.num(overview?.movements_today?.out ?? 0)}</strong>
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  )
}

export function StockPositionTab({
  loading,
  rows,
  search,
  onSearchChange,
  warehouses,
  warehouseId,
  onWarehouseChange,
}) {
  const totalValue = rows.reduce((sum, row) => sum + (parseFloat(row.value) || 0), 0)
  const lowStock = rows.filter((row) => row.stock_status === 'baixo').length
  const noStock = rows.filter((row) => row.stock_status === 'zerado').length
  const cols = [
    { key: 'name', label: 'Produto', render: (_, row) => (<div><div style={{ fontWeight: 600 }}>{row.name}</div><div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{row.sku} · {row.category_name || '—'}</div></div>) },
    { key: 'warehouse_name', label: 'Depósito', render: (value) => value || '—' },
    { key: 'physical', label: 'Saldo', render: (value) => <span style={{ fontWeight: 700 }}>{fmt.num(value)}</span> },
    { key: 'reserved', label: 'Reservado', render: (value) => fmt.num(value || 0) },
    { key: 'available', label: 'Disponível', render: (value) => fmt.num(value || 0) },
    { key: 'cost_price', label: 'Custo médio', render: (value) => fmt.brl(value || 0) },
    { key: 'value', label: 'Valor', render: (value) => fmt.brl(value || 0) },
    { key: 'min_stock', label: 'Mín.', render: (value, row) => <span style={{ color: row.stock_status === 'baixo' ? 'var(--danger)' : 'var(--muted)' }}>{fmt.num(value || 0)}</span> },
    { key: 'stock_status', label: 'Status', render: (value) => <Badge color={value === 'zerado' ? '#ef4444' : value === 'baixo' ? '#f59e0b' : '#10b981'}>{value === 'zerado' ? 'Zerado' : value === 'baixo' ? 'Baixo' : 'Normal'}</Badge> },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHeading
        title="Posição por produto"
        description="Visão consolidada de saldo físico, disponível e valor por depósito."
      />

      <div className="bi-metric-grid">
        <MetricCard icon={Boxes} label="Itens listados" value={fmt.num(rows.length)} sub="Produtos retornados pelo filtro atual" color="#8b5cf6" />
        <MetricCard icon={Wallet} label="Valor total" value={fmt.brl(totalValue)} sub="Soma do valor em estoque visível" color="#10b981" />
        <MetricCard icon={ShieldAlert} label="Estoque baixo" value={fmt.num(lowStock)} sub="Produtos abaixo do mínimo" color="#f59e0b" />
        <MetricCard icon={PackageSearch} label="Zerados" value={fmt.num(noStock)} sub="Produtos sem saldo disponível" color="#ef4444" />
      </div>

      <ChartCard title="Mapa de estoque" subtitle="Busque por produto e filtre por depósito para revisar a posição operacional.">
        <div className="stock-inline-grid">
          <SearchField value={search} onChange={onSearchChange} placeholder="Buscar por produto, SKU ou categoria..." />
          <Select value={warehouseId} onChange={(e) => onWarehouseChange(e.target.value)}>
            <option value="">Todos os depósitos</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
            ))}
          </Select>
        </div>

        <div className="stock-table-wrap">
          {loading ? <Spinner text="Carregando posição de estoque..." /> : rows.length === 0 ? (
            <EmptyAnalyticsState title="Nenhum item encontrado" description="Ajuste o termo de busca ou altere o depósito selecionado." />
          ) : (
            <Table columns={cols} data={rows} />
          )}
        </div>
      </ChartCard>
    </div>
  )
}

export function StockKardexTab({
  selectedProduct,
  productSearch,
  onProductSearch,
  productResults,
  searchingProduct,
  onSelectProduct,
  onClearProduct,
  productKpis,
  showFilters,
  filtersNode,
  onToggleFilters,
  loading,
  rows,
  columns,
  onRow,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHeading
        title="Movimentações e rastreabilidade"
        description="Selecione um produto para navegar pelo kardex, filtrar o histórico e auditar movimentações."
        action={<Btn variant="ghost" onClick={onToggleFilters}>{showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}</Btn>}
      />

      <ChartCard title="Selecionar produto" subtitle="Procure por nome, SKU, marca, modelo ou código de barras para abrir o histórico.">
        <SearchField value={productSearch} onChange={onProductSearch} placeholder="Buscar produto para abrir o kardex..." />
        {searchingProduct && <div className="stock-helper-text">Buscando produtos...</div>}
        <SearchResults results={productResults} onSelect={onSelectProduct} />

        {selectedProduct ? (
          <div className="stock-selected-product">
            <div className="stock-selected-product__media">
              {selectedProduct.image_base64 ? <img src={selectedProduct.image_base64} alt="" /> : <Package size={18} />}
            </div>
            <div className="stock-selected-product__copy">
              <strong>{selectedProduct.name}</strong>
              <span>
                SKU: {selectedProduct.sku}
                {selectedProduct.brand ? ` · ${selectedProduct.brand}` : ''}
              </span>
            </div>
            <div className="stock-selected-product__value">
              {fmt.num(selectedProduct.stock_quantity)} {selectedProduct.unit}
            </div>
            <Btn variant="ghost" size="sm" onClick={onClearProduct}>Limpar</Btn>
          </div>
        ) : (
          <div className="stock-empty-block">
            <EmptyAnalyticsState
              title="Nenhum produto selecionado"
              description="Escolha um produto acima para desbloquear KPIs, filtros de kardex e a tabela de movimentações."
            />
          </div>
        )}
      </ChartCard>

      {selectedProduct && productKpis}

      {showFilters && (
        <ChartCard title="Filtros avançados" subtitle="Refine o histórico por período, tipo, depósito, documento, parceiro ou IMEI.">
          {filtersNode}
        </ChartCard>
      )}

      <ChartCard
        title="Histórico de movimentações"
        subtitle={selectedProduct ? `Movimentações registradas para ${selectedProduct.name}.` : 'Selecione um produto para visualizar a tabela.'}
      >
        <div className="stock-table-wrap">
          {!selectedProduct ? (
            <EmptyAnalyticsState title="Kardex aguardando produto" description="A busca acima é obrigatória para carregar o histórico e evitar consultas amplas demais." />
          ) : loading ? (
            <Spinner text="Carregando movimentações..." />
          ) : rows.length === 0 ? (
            <EmptyAnalyticsState title="Nenhuma movimentação encontrada" description="O produto selecionado não possui registros com os filtros atuais." />
          ) : (
            <Table columns={columns} data={rows} onRow={onRow} />
          )}
        </div>
      </ChartCard>
    </div>
  )
}

export function StockImeiShell({ children, hasSelection = false, onBack }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHeading
        title="Rastreamento por IMEI e serial"
        description="Encontre rapidamente unidades rastreáveis e navegue pelo histórico detalhado de cada item."
        action={hasSelection && onBack ? <Btn variant="ghost" onClick={onBack}>Voltar à busca</Btn> : null}
      />
      {children}
    </div>
  )
}

export function StockInventoryTab({ onOpenInventory }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHeading
        title="Inventário orientado"
        description="Registre contagens com contexto claro, motivo obrigatório e ajuste automático de divergência."
        action={<Btn onClick={onOpenInventory}>Novo inventário</Btn>}
      />

      <div className="bi-metric-grid">
        <MetricCard icon={ScanSearch} label="Conferência guiada" value="1 fluxo" sub="Seleção de produto, contagem e ajuste no mesmo processo" color="#8b5cf6" />
        <MetricCard icon={ClipboardList} label="Motivo obrigatório" value="100%" sub="Toda divergência sai documentada no histórico" color="#f59e0b" />
        <MetricCard icon={Wallet} label="Ajuste automático" value="Ativo" sub="Sistema calcula a diferença e gera a movimentação" color="#10b981" />
      </div>

      <ChartCard title="Como funciona" subtitle="Fluxo pensado para conferência rápida sem perder rastreabilidade.">
        <div className="stock-process-list">
          <div className="stock-process-list__item"><span>1</span><div><strong>Selecione o produto</strong><p>Pesquise o item e confira o saldo atual registrado pelo sistema.</p></div></div>
          <div className="stock-process-list__item"><span>2</span><div><strong>Informe a quantidade contada</strong><p>Registre a contagem real para que o sistema calcule automaticamente a diferença.</p></div></div>
          <div className="stock-process-list__item"><span>3</span><div><strong>Justifique a divergência</strong><p>O motivo fica gravado no kardex para auditoria posterior.</p></div></div>
        </div>
      </ChartCard>
    </div>
  )
}

export function StockTransfersTab({
  rows,
  warehouses,
  warehouseId,
  onWarehouseChange,
  onOpenTransfer,
}) {
  const totalQuantity = rows.reduce((sum, row) => sum + (parseFloat(row.quantity) || 0), 0)
  const cols = [
    { key: 'created_at', label: 'Data', render: (value) => value ? new Date(value).toLocaleString('pt-BR') : '—' },
    { key: 'product_name', label: 'Produto', render: (_, row) => (<div><div style={{ fontWeight: 600 }}>{row.product_name}</div><div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{row.sku}</div></div>) },
    { key: 'warehouse_name', label: 'Origem', render: (value) => value || '—' },
    { key: 'warehouse_dest_name', label: 'Destino', render: (value) => value || '—' },
    { key: 'quantity', label: 'Qtd', render: (value) => fmt.num(value) },
    { key: 'movement_type', label: 'Tipo', render: (value) => <Badge color={value === 'transfer_out' ? '#eab308' : '#06b6d4'}>{value === 'transfer_out' ? 'Saída' : 'Entrada'}</Badge> },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHeading
        title="Transferências entre depósitos"
        description="Acompanhe o deslocamento interno de estoque e abra novas transferências sem sair da tela."
        action={<Btn onClick={onOpenTransfer}>Nova transferência</Btn>}
      />

      <div className="bi-metric-grid">
        <MetricCard icon={ArrowRightLeft} label="Movimentos listados" value={fmt.num(rows.length)} sub="Registros retornados no filtro atual" color="#8b5cf6" />
        <MetricCard icon={Warehouse} label="Quantidade transferida" value={fmt.num(totalQuantity)} sub="Volume somado das transferências visíveis" color="#06b6d4" />
      </div>

      <ChartCard
        title="Histórico de transferências"
        subtitle="Revise origem, destino e volume transportado entre depósitos."
        actions={(
          <div className="stock-toolbar__field">
            <Select value={warehouseId} onChange={(e) => onWarehouseChange(e.target.value)}>
              <option value="">Todos os depósitos</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
              ))}
            </Select>
          </div>
        )}
      >
        <div className="stock-table-wrap">
          {rows.length === 0 ? (
            <EmptyAnalyticsState title="Nenhuma transferência encontrada" description="Ainda não há transferências registradas para o filtro atual." />
          ) : (
            <Table columns={cols} data={rows} />
          )}
        </div>
      </ChartCard>
    </div>
  )
}
