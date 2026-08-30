# CoffeeOS — guía rápida del punto de venta

## Abrir CoffeeOS

1. Abre Docker Desktop y espera a que indique que está en ejecución.
2. En PowerShell, entra a la carpeta de CoffeeOS.
3. Ejecuta:

   ```powershell
   docker compose up -d
   ```

4. Abre Edge y visita `http://localhost:3001`.
5. Para revisar los códigos de correo durante las pruebas locales, abre
   `http://localhost:8025`.

## Primera configuración

1. Crea el negocio y verifica el correo con el código de seis dígitos.
2. En **Configuración**, crea una empresa, una sucursal y una terminal.
3. En **Inventario**, agrega ingredientes, unidad, existencia inicial y
   cantidad mínima para recibir un aviso.
4. En **Menú y productos**, crea categorías y productos.
5. En cada producto configura:
   - precio base;
   - receta que se descuenta del inventario;
   - grupos de opciones, por ejemplo fruta o mermelada;
   - extras con precio adicional y consumo de ingrediente.

## Vender

1. En **Caja y cierre**, abre la caja e indica el fondo inicial.
2. En **Punto de venta**, selecciona una categoría y un producto.
3. Elige opciones o extras, agrega la cantidad y confirma.
4. Escribe cuánto efectivo entrega el cliente.
5. CoffeeOS calcula el cambio y registra la venta.
6. Pulsa **Imprimir ticket** si Windows tiene una impresora de tickets
   instalada.

## Finalizar el día

1. Abre **Caja y cierre**.
2. Cuenta el efectivo físico y escribe la cantidad.
3. Pulsa **Cerrar caja y ver resumen**.
4. CoffeeOS mostrará ventas, total vendido, efectivo esperado, diferencia y
   los ingredientes que necesitan reposición.

## Detener CoffeeOS

Ejecuta:

```powershell
docker compose stop
```

Este comando conserva la base de datos y el inventario. No uses
`docker compose down -v`, porque elimina los volúmenes y puede borrar los
datos locales.
