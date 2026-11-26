// ─────────────────────────────────────────────────────────────
//  datos.ts  —  Lee y valida marca.json y productos.json.
//  Si hay un error, el sitio no se publica y el mensaje indica
//  exactamente qué corregir. Los estudiantes NO editan este archivo.
// ─────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { z } from "astro/zod";

import marcaCruda from "../data/marca.json";
import productosCrudos from "../data/productos.json";

// ── Validadores reutilizables ────────────────────────────────
const color = z
  .string()
  .regex(
    /^#[0-9a-fA-F]{6}$/,
    "Escribe el color con # y 6 caracteres, p. ej. #1F6F5B",
  );

const fuente = z
  .string()
  .regex(
    /^[A-Za-z0-9 ]+$/,
    "Solo el nombre de la fuente, sin símbolos (ejemplo: Poppins)",
  );

const enlaceOpcional = z.union([
  z.literal(""),
  z.string().url("Escribe el enlace completo, comenzando con https://"),
]);

// ── Esquema de marca.json ────────────────────────────────────
const esquemaMarca = z.object({
  nombre: z.string().min(2, "Es muy corto").max(40, "Máximo 40 caracteres"),
  eslogan: z.string().max(80, "Máximo 80 caracteres"),
  logo: z.string().min(1, "Escribe el nombre del archivo del logo"),
  colores: z.object({
    principal: color,
    secundario: color,
    fondo: color,
    texto: color,
  }),
  fuentes: z.object({ titulo: fuente, cuerpo: fuente }),
  esquinas: z.enum(["rectas", "suaves", "redondas"], {
    errorMap: () => ({
      message: "Usa una de estas palabras: rectas, suaves o redondas",
    }),
  }),
  portada: z.object({
    titulo: z.string().min(3, "Es muy corto").max(70, "Máximo 70 caracteres"),
    subtitulo: z.string().max(160, "Máximo 160 caracteres"),
    imagen: z
      .string()
      .min(1, "Escribe el nombre del archivo de la imagen")
      .optional(),
    textoBoton: z
      .string()
      .min(1, "No puede estar vacío")
      .max(25, "Máximo 25 caracteres"),
    textoBotonSecundario: z.string().max(30, "Máximo 30 caracteres").optional(),
    badge: z.string().max(40, "Máximo 40 caracteres").optional(),
    productoDestacado: z.string().max(50, "Máximo 50 caracteres").optional(),
  }),
  nosotros: z.object({
    titulo: z.string().min(2, "Es muy corto").max(40, "Máximo 40 caracteres"),
    texto: z.string().max(500, "Máximo 500 caracteres"),
    puntos: z
      .array(z.string().max(60, "Máximo 60 caracteres"))
      .max(4, "Máximo 4 puntos"),
  }),
  contacto: z.object({
    whatsapp: z
      .string()
      .regex(
        /^51\d{9}$/,
        "Escribe el número con 51 al inicio y 9 dígitos más, sin espacios ni +",
      ),
    mensaje: z.string().max(120, "Máximo 120 caracteres"),
    horario: z.string().max(80, "Máximo 80 caracteres"),
    instagram: enlaceOpcional,
    facebook: enlaceOpcional,
  }),
});

// ── Esquema de productos.json ────────────────────────────────
const esquemaProductos = z
  .array(
    z.object({
      nombre: z.string().min(2, "Es muy corto").max(50, "Máximo 50 caracteres"),
      descripcion: z.string().max(200, "Máximo 200 caracteres"),
      precio: z.number().positive("El precio debe ser mayor que 0"),
      imagen: z.string().min(1, "Escribe el nombre del archivo de la imagen"),
      etiqueta: z.string().max(20, "Máximo 20 caracteres").optional(),
      destacado: z.boolean().optional(),
    }),
  )
  .min(1, "Agrega al menos un producto")
  .max(12, "Máximo 12 productos");

// Tipos exportados (útiles para tipar props en componentes)
export type Marca = z.infer<typeof esquemaMarca>;
export type Producto = z.infer<typeof esquemaProductos>[number];

// ── Función de validación ────────────────────────────────────
function formatearMensaje(issue: z.ZodIssue): string {
  if (issue.code === "invalid_type") {
    if (issue.received === "undefined")
      return "Falta este dato (revisa que exista y esté escrito correctamente)";
    if (issue.expected === "number")
      return "Debe ser un número, sin comillas (ejemplo: 12.5)";
    if (issue.expected === "string") return "Debe ser texto, entre comillas";
  }
  return issue.message;
}

function validar<T>(esquema: z.ZodType<T>, datos: unknown, archivo: string): T {
  const resultado = esquema.safeParse(datos);
  if (resultado.success) return resultado.data;

  const lineas = resultado.error.issues.map((i) => {
    const ruta = i.path
      .map((p) => (typeof p === "number" ? `n.º ${p + 1}` : String(p)))
      .join(" → ");
    return `  • ${ruta || "(archivo completo)"}: ${formatearMensaje(i)}`;
  });

  throw new Error(`\n\nHay un error en ${archivo}:\n${lineas.join("\n")}\n`);
}

// ── Verificar que las imágenes existen en /public ────────────
function verificarImagen(ruta: string, donde: string): void {
  const rutaCompleta = path.join(process.cwd(), "public", ruta);
  if (!fs.existsSync(rutaCompleta)) {
    throw new Error(
      `\n\nNo encuentro la imagen "${ruta}" (${donde}).\n` +
        `Revisa que el archivo esté en la carpeta public/ y que el nombre coincida ` +
        `exactamente (mayúsculas, guiones y extensión).\n`,
    );
  }
}

// ── Validación al arrancar ───────────────────────────────────
export const marca = validar(esquemaMarca, marcaCruda, "marca.json");
export const productos = validar(
  esquemaProductos,
  productosCrudos,
  "productos.json",
);

verificarImagen(marca.logo, "logo en marca.json");
if (marca.portada.imagen) {
  verificarImagen(marca.portada.imagen, "imagen de la portada en marca.json");
}
productos.forEach((p, i) =>
  verificarImagen(p.imagen, `producto n.º ${i + 1} en productos.json`),
);

// ── Contraste de color (WCAG) ────────────────────────────────
function luminancia(hex: string): number {
  const canal = (offset: number): number => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

function contraste(a: string, b: string): number {
  const lums = [luminancia(a), luminancia(b)].sort((m, n) => n - m) as [
    number,
    number,
  ];
  return (lums[0] + 0.05) / (lums[1] + 0.05);
}

/** Devuelve blanco o negro según cuál se lee mejor sobre el color dado. */
function sobreColor(fondo: string): string {
  return contraste("#ffffff", fondo) >= contraste("#14181c", fondo)
    ? "#ffffff"
    : "#14181c";
}

// Aviso de contraste insuficiente
const { colores } = marca;
if (contraste(colores.texto, colores.fondo) < 4.5) {
  console.warn(
    '\n⚠ Los colores "texto" y "fondo" tienen poco contraste: el texto se leerá con dificultad.\n' +
      "Usa un texto muy oscuro sobre fondo claro (o al revés).\n",
  );
}

// ── Variables CSS ────────────────────────────────────────────
const radios = { rectas: "0px", suaves: "10px", redondas: "24px" } as const;

/** Bloque de variables CSS listo para el atributo style del <html>. */
export const estiloVars = [
  `--principal:${colores.principal}`,
  `--secundario:${colores.secundario}`,
  `--fondo:${colores.fondo}`,
  `--texto:${colores.texto}`,
  `--sobre-principal:${sobreColor(colores.principal)}`,
  `--sobre-secundario:${sobreColor(colores.secundario)}`,
  `--radio:${radios[marca.esquinas]}`,
  `--f-titulo:'${marca.fuentes.titulo}'`,
  `--f-cuerpo:'${marca.fuentes.cuerpo}'`,
].join(";");

// ── URL de fuentes Google ────────────────────────────────────
const familiaFuente = (nombre: string): string =>
  `family=${nombre.trim().replace(/ /g, "+")}:wght@400;700`;

export const urlFuentes =
  `https://fonts.googleapis.com/css2?` +
  `${familiaFuente(marca.fuentes.titulo)}&` +
  `${familiaFuente(marca.fuentes.cuerpo)}&display=swap`;

// Verifica que las fuentes existan en Google Fonts (solo en build con internet)
try {
  const respuesta = await fetch(urlFuentes, {
    signal: AbortSignal.timeout(5000),
  });
  if (respuesta.status === 400 || respuesta.status === 404) {
    throw new Error(
      `\n\nLa fuente "${marca.fuentes.titulo}" o "${marca.fuentes.cuerpo}" no está disponible ` +
        `en Google Fonts con estilos Regular y Negrita.\n` +
        `Revisa el nombre exacto en fonts.google.com o elige otra fuente.\n`,
    );
  }
} catch (err: unknown) {
  // Si el error es nuestro (fuente no encontrada), sí lo relanzamos
  if (err instanceof Error && err.message.includes("Google Fonts")) throw err;
  // Sin internet durante el build: no bloqueamos la publicación
}

// ── Utilidades exportadas para las páginas ───────────────────

/** Genera la ruta correcta de un archivo en /public (compatible con GitHub Pages). */
export const url = (ruta: string): string =>
  `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${ruta.replace(/^\//, "")}`;

/** Formatea un precio en soles. Ejemplo: precio(12.5) → "S/ 12.50" */
export const precio = (n: number): string => `S/ ${n.toFixed(2)}`;

/** Genera el enlace de WhatsApp con el número y el mensaje prellenado. */
export const enlaceWhatsApp = (numero: string, mensaje: string): string =>
  `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
