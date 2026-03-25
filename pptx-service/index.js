const express = require('express')
const PptxGenJS = require('pptxgenjs')
const app = express()
app.use(express.json({ limit: '10mb' }))

// Design system
const PALETTES = {
  midnight_executive: { primary: '1E2761', secondary: 'CADCFC', accent: 'FFFFFF' },
  coral_energy: { primary: 'F96167', secondary: 'F9E795', accent: '2F3C7E' },
  ocean_gradient: { primary: '065A82', secondary: '1C7293', accent: '21295C' },
  charcoal_minimal: { primary: '36454F', secondary: 'F2F2F2', accent: '212121' },
  teal_trust: { primary: '028090', secondary: '00A896', accent: '02C39A' },
  warm_terracotta: { primary: 'B85042', secondary: 'E7E8D1', accent: 'A7BEAE' },
}

const FONT_PAIRS = [
  { title: 'Georgia', body: 'Calibri' },
  { title: 'Trebuchet MS', body: 'Calibri' },
  { title: 'Arial Black', body: 'Arial' },
]

app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.post('/generate', async (req, res) => {
  try {
    const { slides, theme = 'midnight_executive', font_pair = 0, title = 'Presentation' } = req.body
    
    const palette = PALETTES[theme] || PALETTES.midnight_executive
    const fonts = FONT_PAIRS[font_pair % FONT_PAIRS.length]
    
    const prs = new PptxGenJS()
    prs.layout = 'LAYOUT_16x9'
    prs.title = title
    
    for (const slide of slides) {
      const s = prs.addSlide()
      
      // Background
      const bgColor = slide.is_dark ? palette.primary : 'FFFFFF'
      s.background = { color: bgColor }
      
      // Render elements
      for (const el of (slide.elements || [])) {
        if (el.type === 'text') {
          s.addText(el.text || '', {
            x: el.x, y: el.y, w: el.w, h: el.h,
            fontSize: el.fontSize || 16,
            bold: el.bold || false,
            color: el.color || (slide.is_dark ? 'FFFFFF' : '222222'),
            fontFace: el.is_title ? fonts.title : fonts.body,
            align: el.align || 'left',
            valign: 'top',
            margin: 0.1,
            wrap: true,
          })
        } else if (el.type === 'table') {
          if (el.tableData && el.tableData.rows) {
            const rows = [
              el.tableData.headers.map(h => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: { color: palette.primary } } })),
              ...el.tableData.rows.map(row => row.map(cell => ({ text: cell || '' })))
            ]
            s.addTable(rows, {
              x: el.x, y: el.y, w: el.w,
              fontSize: 12,
              border: { pt: 1, color: 'CCCCCC' },
              color: '333333',
            })
          }
        } else if (el.type === 'shape') {
          s.addShape(prs.ShapeType[el.shape_type || 'rect'], {
            x: el.x, y: el.y, w: el.w, h: el.h,
            fill: { color: el.fill_color || palette.accent },
            line: { color: el.line_color || palette.primary, pt: el.line_pt || 0 },
          })
        } else if (el.type === 'image' && el.image_url) {
          try {
            s.addImage({ path: el.image_url, x: el.x, y: el.y, w: el.w, h: el.h })
          } catch (e) {
            // image failed, skip silently
          }
        }
      }
    }
    
    const buffer = await prs.stream()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    res.setHeader('Content-Disposition', `attachment; filename="${title}.pptx"`)
    res.send(Buffer.from(buffer))
    
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`pptx-service running on :${PORT}`))
