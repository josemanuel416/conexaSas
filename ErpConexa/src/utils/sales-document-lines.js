export function inferLineItemMode(lines) {
  if (!lines?.length) return 'servicios'
  const hasService = lines.some((l) => l.serviceId)
  const hasArticle = lines.some((l) => !l.serviceId)
  if (hasService && hasArticle) return 'ambos'
  if (hasArticle) return 'articulos'
  return 'servicios'
}

export function emptyLine(lineType = 'service') {
  return {
    lineType,
    serviceId: null,
    articleId: null,
    itemCode: '',
    description: '',
    quantity: 1,
    unitPrice: 0,
    taxRate: 19,
  }
}

export function mapDetailToLine(d, articles = []) {
  const isArticle = !d.serviceId
  const article = isArticle
    ? articles.find((a) => a.code === d.itemCode)
    : null
  return {
    lineType: isArticle ? 'article' : 'service',
    serviceId: d.serviceId || null,
    articleId: article?.id || null,
    itemCode: d.itemCode || '',
    description: d.description || '',
    quantity: d.quantity,
    unitPrice: d.unitPrice,
    taxRate: d.taxRate,
  }
}

export function effectiveLineType(line, documentKind, lineItemMode) {
  if (documentKind !== 'cotizacion') return 'service'
  if (lineItemMode === 'articulos') return 'article'
  if (lineItemMode === 'servicios') return 'service'
  return line.lineType || 'service'
}

export function lineCalc(line) {
  const base = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)
  const taxAmount = base * ((Number(line.taxRate) || 0) / 100)
  const lineTotal = Math.round((base + taxAmount) * 100) / 100
  return { base, taxAmount, lineTotal }
}

export function calcDocumentTotals(lines) {
  let base = 0
  let tax = 0
  let total = 0
  for (const line of lines) {
    const calc = lineCalc(line)
    base += calc.base
    tax += calc.taxAmount
    total += calc.lineTotal
  }
  return {
    base: Math.round(base * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round(total * 100) / 100,
  }
}

export function buildLinePayload(line, documentKind, lineItemMode) {
  const type = effectiveLineType(line, documentKind, lineItemMode)
  if (type === 'article') {
    return {
      articleId: line.articleId,
      itemCode: line.itemCode,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
    }
  }
  return {
    serviceId: line.serviceId,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxRate: line.taxRate,
  }
}

export function validateDocumentLines(lines, documentKind, lineItemMode) {
  const missing = []
  if (!lines.length) missing.push('Al menos una línea')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const type = effectiveLineType(line, documentKind, lineItemMode)
    if (type === 'service' && !line.serviceId) missing.push(`Servicio en línea ${i + 1}`)
    if (type === 'article' && !line.articleId) missing.push(`Artículo en línea ${i + 1}`)
    if (!line.quantity || line.quantity <= 0) missing.push(`Cantidad en línea ${i + 1}`)
  }
  return missing
}
