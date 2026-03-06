import * as XLSX from 'xlsx'
import { MONTH_NAMES } from './biTheme'

function addSheet(workbook, name, rows) {
  if (!rows?.length) return
  const formatted = rows.map(row => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === 'number' && value % 1 !== 0 ? Math.round(value * 100) / 100 : value,
    ])
  ))
  const sheet = XLSX.utils.json_to_sheet(formatted)
  XLSX.utils.book_append_sheet(workbook, sheet, String(name).substring(0, 31))
}

function toIsoDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

export function exportBiWorkbook(tab, allData) {
  const workbook = XLSX.utils.book_new()
  const { data, biFinance, biSellers, biProducts, biClients, biCrm, biServiceOrders, biReturns, chartData } = allData

  switch (tab) {
    case 'geral':
      if (!data) break
    addSheet(workbook, 'KPIs', [{
      Pedidos: data.orders?.total,
      Entregues: data.orders?.delivered,
      Receita: data.orders?.revenue,
      Produtos_ativos: data.products?.total,
      Estoque_baixo: data.products?.low_stock,
      Leads_abertos: data.leads?.open,
      Leads_ganhos: data.leads?.won,
    }])
    addSheet(workbook, 'Ultimos pedidos', data.recentOrders?.map(o => ({
      Numero: o.number,
      Cliente: o.client_name,
      Status: o.status,
      Total: o.total,
      Data: o.created_at,
    })))
    addSheet(workbook, 'Pedidos por status', data.ordersByStatus?.map(s => ({
      Status: s.label,
      Quantidade: s.count,
      Valor: s.amount,
    })))
    addSheet(workbook, 'Top vendedores', data.topSellers?.map(s => ({
      Nome: s.name,
      Pedidos: s.total_orders,
      Total: s.total_sold,
    })))
    addSheet(workbook, 'Estoque baixo', data.lowStock?.map(p => ({
      Produto: p.name,
      SKU: p.sku,
      Estoque: p.stock_quantity,
      Minimo: p.min_stock,
    })))
    addSheet(workbook, 'Receita mensal', chartData?.map(item => ({
      Mes: item.label,
      Receita: item.value,
    })))
    addSheet(workbook, 'Pedidos detalhados', data.detailedOrders?.map(order => ({
      Numero: order.number,
      Status: order.status,
      Cliente: order.client_name,
      Tipo_cliente: order.client_type,
      Documento_cliente: order.client_document,
      Telefone_cliente: order.client_phone,
      Vendedor: order.seller_name,
      Subtotal: order.subtotal,
      Desconto: order.discount,
      Total: order.total,
      Criado_em: toIsoDate(order.created_at),
      Atualizado_em: toIsoDate(order.updated_at),
    })))
    addSheet(workbook, 'Itens por pedido', data.detailedOrderItems?.map(item => ({
      Pedido: item.order_number,
      Status_pedido: item.order_status,
      Data_pedido: toIsoDate(item.created_at),
      Cliente: item.client_name,
      Vendedor: item.seller_name,
      Produto: item.product_name,
      SKU: item.sku,
      Marca: item.brand,
      Quantidade: item.quantity,
      Preco_unitario: item.unit_price,
      Desconto: item.discount,
      Total_item: item.total,
    })))
      break

    case 'financeiro': {
      if (!biFinance?.summary) break
    const summary = biFinance.summary
    addSheet(workbook, 'Resumo', [{
      Receitas: parseFloat(summary.income_paid || 0) + parseFloat(summary.crm_won_value || 0) + parseFloat(summary.os_revenue || 0),
      Despesas: summary.expense_paid,
      A_receber: summary.income_pending,
      A_pagar: summary.expense_pending,
      Inadimplencia_receita: summary.income_overdue,
      Inadimplencia_despesa: summary.expense_overdue,
    }])
    addSheet(workbook, 'Evolucao', biFinance.evolution?.map(row => ({
      Mes: MONTH_NAMES[Number(row.month) - 1],
      Ano: row.year,
      Receita: row.income,
      Despesa: row.expense,
    })))
    addSheet(workbook, 'Por categoria', biFinance.byCat?.map(row => ({
      Categoria: row.name,
      Tipo: row.type,
      Total: row.total,
    })))
    addSheet(workbook, 'Lancamentos', biFinance.transactions?.map(row => ({
      Tipo: row.type,
      Titulo: row.title,
      Categoria: row.category_name,
      Cliente: row.client_name,
      Vendedor: row.seller_name,
      Pedido: row.order_number,
      Conta: row.account_name,
      Forma_pagamento: row.payment_method,
      Valor: row.amount,
      Valor_pago: row.paid_amount,
      Taxa: row.fee_amount,
      Desconto: row.discount_amount,
      Pago: row.paid ? 'Sim' : 'Nao',
      Vencimento: toIsoDate(row.due_date),
      Pago_em: toIsoDate(row.paid_date),
      Documento: row.document_ref,
      Observacoes: row.notes,
    })))
    addSheet(workbook, 'Fontes de receita', biFinance.incomeSources?.map(row => ({
      Origem: row.source_label,
      Tipo_origem: row.source,
      Titulo: row.title,
      Cliente: row.client_name,
      Vendedor: row.seller_name,
      Pedido: row.order_number,
      Categoria: row.category_name,
      Valor: row.amount,
      Pago: row.paid ? 'Sim' : 'Nao',
      Data_competencia: toIsoDate(row.due_date),
      Data_pagamento: toIsoDate(row.paid_date),
    })))
      break
    }

    case 'vendedores':
      if (!biSellers?.ranking?.length) break
    addSheet(workbook, 'Ranking', biSellers.ranking.map(row => ({
      Nome: row.name,
      Pedidos: row.orders,
      Receita: row.revenue,
      Ticket: row.ticket,
      Comissao: row.commission_value,
    })))
    addSheet(workbook, 'Detalhe produtos', biSellers.detail?.topProducts?.map(row => ({
      Produto: row.name,
      SKU: row.sku,
      Quantidade: row.qty,
      Receita: row.revenue,
    })))
    addSheet(workbook, 'Vendas detalhadas', biSellers.detailedOrders?.map(row => ({
      Vendedor: row.seller_name,
      Comissao_percentual: row.commission,
      Numero_pedido: row.number,
      Status: row.status,
      Cliente: row.client_name,
      Documento_cliente: row.client_document,
      Telefone_cliente: row.client_phone,
      Subtotal: row.subtotal,
      Desconto: row.discount,
      Total: row.total,
      Criado_em: toIsoDate(row.created_at),
      Atualizado_em: toIsoDate(row.updated_at),
    })))
    addSheet(workbook, 'Vendas vendedor selecionado', biSellers.detail?.orders?.map(row => ({
      Numero_pedido: row.number,
      Status: row.status,
      Cliente: row.client_name,
      Documento_cliente: row.client_document,
      Telefone_cliente: row.client_phone,
      Subtotal: row.subtotal,
      Desconto: row.discount,
      Total: row.total,
      Criado_em: toIsoDate(row.created_at),
      Atualizado_em: toIsoDate(row.updated_at),
    })))
    addSheet(workbook, 'Itens vendas detalhadas', biSellers.detailedOrderItems?.map(row => ({
      Vendedor: row.seller_name,
      Pedido: row.order_number,
      Status_pedido: row.order_status,
      Data_pedido: toIsoDate(row.created_at),
      Cliente: row.client_name,
      Produto: row.product_name,
      SKU: row.sku,
      Marca: row.brand,
      Quantidade: row.quantity,
      Preco_unitario: row.unit_price,
      Desconto: row.discount,
      Total_item: row.total,
    })))
    addSheet(workbook, 'Itens vendedor selecionado', biSellers.detail?.orderItems?.map(row => ({
      Pedido: row.order_number,
      Status_pedido: row.order_status,
      Data_pedido: toIsoDate(row.created_at),
      Cliente: row.client_name,
      Produto: row.product_name,
      SKU: row.sku,
      Marca: row.brand,
      Quantidade: row.quantity,
      Preco_unitario: row.unit_price,
      Desconto: row.discount,
      Total_item: row.total,
    })))
      break

    case 'produtos':
      if (!biProducts) break
    addSheet(workbook, 'Mais vendidos', biProducts.topSold?.map(row => ({
      Produto: row.name,
      SKU: row.sku,
      Quantidade: row.qty_sold,
      Receita: row.revenue,
    })))
    addSheet(workbook, 'Maior receita', biProducts.topRevenue?.map(row => ({
      Produto: row.name,
      SKU: row.sku,
      Receita: row.revenue,
      Quantidade: row.qty_sold,
    })))
    addSheet(workbook, 'Categorias', biProducts.categories?.map(row => ({
      Categoria: row.category,
      Produtos: row.products,
      Quantidade: row.qty,
      Receita: row.revenue,
    })))
    addSheet(workbook, 'Itens vendidos detalhados', biProducts.detailedSales?.map(row => ({
      Produto: row.name,
      SKU: row.sku,
      Marca: row.brand,
      Pedido: row.order_number,
      Status_pedido: row.order_status,
      Cliente: row.client_name,
      Vendedor: row.seller_name,
      Quantidade: row.quantity,
      Preco_unitario: row.unit_price,
      Desconto: row.discount,
      Total_item: row.total,
      Custo_produto: row.cost_price,
      Preco_tabela: row.sale_price,
      Data_pedido: toIsoDate(row.created_at),
    })))
    addSheet(workbook, 'Estoque detalhado', biProducts.lowStock?.map(row => ({
      Produto: row.name,
      SKU: row.sku,
      Estoque: row.stock_quantity,
      Minimo: row.min_stock,
    })))
      break

    case 'clientes':
      if (!biClients) break
    addSheet(workbook, 'Top clientes', biClients.topClients?.map(row => ({
      Nome: row.name,
      Tipo: row.type,
      Pedidos: row.orders,
      Receita: row.revenue,
      Ticket: row.ticket,
    })))
    addSheet(workbook, 'Por tipo', biClients.byType?.map(row => ({
      Tipo: row.type,
      Clientes: row.clients,
      Pedidos: row.orders,
      Receita: row.revenue,
    })))
    addSheet(workbook, 'Pedidos por cliente', biClients.detailedOrders?.map(row => ({
      Cliente: row.name,
      Tipo_cliente: row.type,
      Documento: row.document,
      Telefone: row.phone,
      Pedido: row.order_number,
      Status: row.status,
      Vendedor: row.seller_name,
      Subtotal: row.subtotal,
      Desconto: row.discount,
      Total: row.total,
      Data_pedido: toIsoDate(row.created_at),
    })))
    addSheet(workbook, 'Itens por cliente', biClients.detailedOrderItems?.map(row => ({
      Cliente: row.client_name,
      Tipo_cliente: row.client_type,
      Documento: row.document,
      Telefone: row.phone,
      Pedido: row.order_number,
      Status_pedido: row.order_status,
      Data_pedido: toIsoDate(row.created_at),
      Vendedor: row.seller_name,
      Produto: row.product_name,
      SKU: row.sku,
      Marca: row.brand,
      Quantidade: row.quantity,
      Preco_unitario: row.unit_price,
      Desconto: row.discount,
      Total_item: row.total,
    })))
      break

    case 'crm':
      if (!biCrm) break
    addSheet(workbook, 'Visao geral', biCrm.overview ? [biCrm.overview] : [])
    addSheet(workbook, 'Por pipeline', biCrm.byPipeline?.map(row => ({
      Pipeline: row.pipeline,
      Leads: row.leads,
      Ganhos: row.won,
      Perdidos: row.lost,
      Valor_ganho: row.won_value,
    })))
    addSheet(workbook, 'Por origem', biCrm.bySource?.map(row => ({
      Origem: row.source,
      Leads: row.leads,
      Ganhos: row.won,
      Valor_ganho: row.won_value,
    })))
    addSheet(workbook, 'Leads detalhados', biCrm.detailedLeads?.map(row => ({
      Nome: row.name,
      Empresa: row.company,
      Email: row.email,
      Telefone: row.phone,
      Origem: row.source,
      Pipeline: row.pipeline,
      Status: row.status,
      Probabilidade: row.probability,
      Valor_estimado: row.estimated_value,
      Fechamento_previsto: toIsoDate(row.expected_close),
      Criado_em: toIsoDate(row.created_at),
    })))
    addSheet(workbook, 'Ganhos recentes', biCrm.recentWon?.map(row => ({
      Nome: row.name,
      Pipeline: row.pipeline,
      Valor_ganho: row.estimated_value,
      Dias_no_pipeline: row.days_in_pipeline,
      Criado_em: toIsoDate(row.created_at),
    })))
      break

    case 'assistencia':
      if (!biServiceOrders) break
    addSheet(workbook, 'KPIs', biServiceOrders.kpis ? [biServiceOrders.kpis] : [])
    addSheet(workbook, 'Por status', biServiceOrders.byStatus?.map(row => ({
      Status: row.status,
      Quantidade: row.count,
      Receita: row.revenue,
    })))
    addSheet(workbook, 'Receita mensal', biServiceOrders.revenueByMonth?.map(row => ({
      Mes: row.month,
      Entregues: row.delivered,
      Receita: row.revenue,
    })))
    addSheet(workbook, 'Ordens detalhadas', biServiceOrders.ordersList?.map(row => ({
      Numero: row.number,
      Status: row.status,
      Prioridade: row.priority,
      Cliente: row.client_name,
      Tecnico: row.technician_name,
      Marca: row.brand,
      Modelo: row.model,
      IMEI: row.imei,
      Defeito: row.defect_reported,
      Orcamento_inicial: row.initial_quote,
      Receita: row.revenue,
      Recebido_em: toIsoDate(row.received_at),
      Concluido_em: toIsoDate(row.completed_at),
      Entregue_em: toIsoDate(row.delivered_at),
    })))
    addSheet(workbook, 'Itens da OS', biServiceOrders.itemsList?.map(row => ({
      OS: row.service_order_number,
      Status_OS: row.service_order_status,
      Cliente: row.client_name,
      Tipo_item: row.type,
      Servico: row.service_name,
      Produto: row.product_name,
      SKU: row.sku,
      Descricao: row.description,
      Quantidade: row.quantity,
      Custo_unitario: row.unit_cost,
      Preco_unitario: row.unit_price,
      Desconto: row.discount,
      Recebido_em: toIsoDate(row.received_at),
      Concluido_em: toIsoDate(row.completed_at),
      Entregue_em: toIsoDate(row.delivered_at),
    })))
      break

    case 'devolucoes':
      if (!biReturns) break
    addSheet(workbook, 'Resumo', biReturns.summary ? [biReturns.summary] : [])
    addSheet(workbook, 'Por status', biReturns.byStatus?.map(row => ({
      Status: row.status,
      Quantidade: row.count,
      Valor: row.refund_amount,
    })))
    addSheet(workbook, 'Por tipo', biReturns.byType?.map(row => ({
      Tipo: row.type,
      Quantidade: row.count,
      Valor: row.refund_amount,
    })))
    addSheet(workbook, 'Devolucoes detalhadas', biReturns.returnsList?.map(row => ({
      Numero: row.number,
      Pedido_origem: row.order_number,
      Status: row.status,
      Tipo: row.type,
      Origem: row.origin,
      Cliente: row.client_name,
      Documento_cliente: row.client_document,
      Telefone_cliente: row.client_phone,
      Subtotal: row.subtotal,
      Valor_devolvido: row.total_refund,
      Tipo_reembolso: row.refund_type,
      Metodo_reembolso: row.refund_method,
      Criado_em: toIsoDate(row.created_at),
      Atualizado_em: toIsoDate(row.updated_at),
    })))
    addSheet(workbook, 'Itens devolvidos', biReturns.itemsList?.map(row => ({
      Devolucao: row.return_number,
      Pedido_origem: row.order_number,
      Status_devolucao: row.return_status,
      Tipo_devolucao: row.return_type,
      Cliente: row.client_name,
      Produto: row.product_name,
      SKU: row.sku,
      IMEI: row.imei,
      Serial: row.serial_number,
      Quantidade_original: row.quantity_original,
      Quantidade_devolvida: row.quantity_returned,
      Preco_unitario: row.unit_price,
      Desconto: row.discount,
      Valor_devolvido: row.total_refund,
      Motivo: row.reason,
      Condicao: row.condition,
      Destino_estoque: row.stock_destination,
      Criado_em: toIsoDate(row.created_at),
    })))
      break

    default:
      break
  }

  if (!workbook.SheetNames.length) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Nenhum dado para exportar']]), 'Info')
  }

  XLSX.writeFile(workbook, `bi-${tab}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
