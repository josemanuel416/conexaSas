# BaseConocimiento

Manual de usuario de Conexa, consultable desde el chat de ayuda del ERP.

No es un servicio con puerto. Sever.Conexa lee estos artículos y responde las preguntas del chat flotante.

## Contenido

| Carpeta | Qué documenta |
|---------|----------------|
| `articulos/modulos.json` | Qué hace cada módulo y dónde se entra |
| `articulos/procesos.json` | Cómo se completa una tarea, paso a paso |
| `articulos/diccionario.json` | Tablas principales y para qué sirve cada una |
| `manuales.json` | Texto completo de cada manual, por id de artículo |

## Cómo agregar un tema

1. Elija el archivo según el tipo: módulo, proceso o diccionario.
2. Agregue un objeto con `id`, `kind`, `module`, `title`, `summary`, `keywords` y `body`.
3. Reinicie Sever.Conexa para que el chat use el texto nuevo.

`keywords` debe incluir las palabras con las que un usuario preguntaría, sin tildes.

## Videos de proceso

Playwright recorre el ERP y deja un video corto en `videos/<id>.webm`. El chat muestra **Ver proceso** cuando ese archivo existe.

El recorrido usa la compañía de prueba `conexasoft` y no confirma compras ni envía documentos a la DIAN.

```powershell
cd BaseConocimiento
npm install
npx playwright install chromium
npm run manuales:grabar
```

Reinicie Sever.Conexa después de grabar para que el chat sirva el video nuevo. El ERP y la API deben estar en ejecución antes de grabar.
