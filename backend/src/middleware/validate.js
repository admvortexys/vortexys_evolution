'use strict';
const { z } = require('zod');

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map(i => i.message).join('; ');
      return res.status(400).json({ error: errors });
    }
    req.validated = result.data;
    next();
  };
}

const schemas = {
  createProduct: z.object({
    sku: z.string().min(1, 'SKU é obrigatório'),
    name: z.string().min(1, 'Nome é obrigatório'),
    description: z.string().optional().nullable(),
    category_id: z.union([z.number(), z.string(), z.null()]).optional(),
    unit: z.string().default('un'),
    cost_price: z.union([z.number(), z.string()]).default(0),
    sale_price: z.union([z.number(), z.string()]).default(0),
    stock_quantity: z.union([z.number(), z.string()]).default(0),
    min_stock: z.union([z.number(), z.string()]).default(0),
    warehouse_id: z.union([z.number(), z.string(), z.null()]).optional(),
    barcode: z.string().optional().nullable(),
    image_base64: z.string().optional().nullable(),
  }),

  createClient: z.object({
    type: z.enum(['client', 'supplier', 'both']).default('client'),
    name: z.string().min(1, 'Nome é obrigatório'),
    document: z.string().optional().nullable(),
    email: z.string().email('E-mail inválido').optional().nullable().or(z.literal('')),
    phone: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  }),

  createOrder: z.object({
    client_id: z.union([z.number(), z.string()]).refine(v => v, 'Cliente é obrigatório'),
    seller_id: z.union([z.number(), z.string(), z.null()]).optional(),
    items: z.array(z.object({
      product_id: z.union([z.number(), z.string()]).refine(v => v, 'Produto é obrigatório'),
      quantity: z.union([z.number(), z.string()]).refine(v => parseFloat(v) > 0, 'Quantidade deve ser maior que zero'),
      unit_price: z.union([z.number(), z.string()]).refine(v => parseFloat(v) >= 0, 'Preço inválido'),
      discount: z.union([z.number(), z.string()]).default(0),
    })).min(1, 'Pedido deve ter pelo menos um item'),
    discount: z.union([z.number(), z.string()]).default(0),
    notes: z.string().optional().nullable(),
  }),

  createTransaction: z.object({
    type: z.enum(['income', 'expense'], { errorMap: () => ({ message: 'Tipo deve ser income ou expense' }) }),
    title: z.string().min(1, 'Descrição é obrigatória'),
    amount: z.union([z.number(), z.string()]).refine(v => parseFloat(v) > 0, 'Valor deve ser maior que zero'),
    due_date: z.string().min(1, 'Data de vencimento é obrigatória'),
    category_id: z.union([z.number(), z.string(), z.null()]).optional(),
    client_id: z.union([z.number(), z.string(), z.null()]).optional(),
    notes: z.string().optional().nullable(),
    paid: z.boolean().default(false),
    paid_date: z.string().optional().nullable(),
    is_recurring: z.boolean().default(false),
    recurrence_type: z.enum(['monthly', 'weekly', 'yearly']).optional().nullable(),
    recurrence_end: z.string().optional().nullable(),
  }),

  createLead: z.object({
    name: z.string().min(1, 'Nome é obrigatório'),
    company: z.string().optional().nullable(),
    email: z.string().email('E-mail inválido').optional().nullable().or(z.literal('')),
    phone: z.string().optional().nullable(),
    source: z.string().optional().nullable(),
    pipeline_id: z.union([z.number(), z.string(), z.null()]).optional(),
    estimated_value: z.union([z.number(), z.string()]).default(0),
    probability: z.union([z.number(), z.string()]).default(0),
    expected_close: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  }),

  stockMovement: z.object({
    product_id: z.union([z.number(), z.string()]).refine(v => v, 'Produto é obrigatório'),
    type: z.enum(['in', 'out', 'adjustment'], { errorMap: () => ({ message: 'Tipo deve ser in, out ou adjustment' }) }),
    movement_type: z.enum([
      'purchase','sale','return_client','return_supplier','transfer_out','transfer_in',
      'adjustment_pos','adjustment_neg','inventory','reserve','unreserve',
      'service_in','service_out','service_discard',
    ]).optional().nullable(),
    quantity: z.union([z.number(), z.string()]).refine(v => parseFloat(v) > 0, 'Quantidade deve ser maior que zero'),
    reason: z.string().optional().nullable(),
    document_type: z.string().optional().nullable(),
    document_number: z.string().optional().nullable(),
    partner_name: z.string().optional().nullable(),
    partner_id: z.union([z.number(), z.string(), z.null()]).optional(),
    warehouse_id: z.union([z.number(), z.string(), z.null()]).optional(),
    warehouse_dest_id: z.union([z.number(), z.string(), z.null()]).optional(),
    cost_unit: z.union([z.number(), z.string(), z.null()]).optional(),
    channel: z.string().optional().nullable(),
    unit_id: z.union([z.number(), z.string(), z.null()]).optional(),
    notes: z.string().optional().nullable(),
  }),

  stockTransfer: z.object({
    product_id: z.union([z.number(), z.string()]).refine(v => v, 'Produto é obrigatório'),
    quantity: z.union([z.number(), z.string()]).refine(v => parseFloat(v) > 0, 'Quantidade deve ser maior que zero'),
    warehouse_id: z.union([z.number(), z.string()]).refine(v => v, 'Depósito de origem é obrigatório'),
    warehouse_dest_id: z.union([z.number(), z.string()]).refine(v => v, 'Depósito de destino é obrigatório'),
    reason: z.string().optional().nullable(),
    unit_id: z.union([z.number(), z.string(), z.null()]).optional(),
  }),

  stockInventory: z.object({
    product_id: z.union([z.number(), z.string()]).refine(v => v, 'Produto é obrigatório'),
    counted_qty: z.union([z.number(), z.string()]).refine(v => parseFloat(v) >= 0, 'Quantidade contada deve ser >= 0'),
    reason: z.string().min(1, 'Motivo é obrigatório para inventário'),
  }),

  createSeller: z.object({
    name: z.string().min(1, 'Nome é obrigatório'),
    email: z.string().email('E-mail inválido').optional().nullable().or(z.literal('')),
    phone: z.string().optional().nullable(),
    document: z.string().optional().nullable(),
    commission: z.union([z.number(), z.string()]).refine(v => {
      const n = parseFloat(v);
      return n >= 0 && n <= 100;
    }, 'Comissão deve ser entre 0 e 100'),
    goal: z.union([z.number(), z.string()]).default(0),
    notes: z.string().optional().nullable(),
    active: z.boolean().default(true),
  }),
};

module.exports = { validate, schemas };
