# Ejercicio Transacciones

Diseña e implementa un servicio en memoria (sin uso de base de datos) que procese transacciones en tiempo real y exponga estadísticas agregadas.

## Requerimientos funcionales

1. El servicio debe exponer los siguientes endpoints:
   - POST /transactions: registra una nueva transacción.
   - GET /statistics: retorna estadísticas agregadas.
2. Cada transacción contiene:
   - timestamp: fecha/hora de la transacción (puede no coincidir con la hora actual del sistema).
   - amount: monto de la transacción (nunca será 0).
   - Valores positivos representan cargos.
   - Valores negativos representan devoluciones.
3. Las estadísticas deben calcularse considerando únicamente las transacciones dentro de una ventana deslizante de 60 segundos, basada en la hora actual del sistema.
4. El endpoint GET /statistics debe retornar:
   - Suma total de cargos.
   - Suma total de devoluciones.
   - Promedio de cargos.
   - Promedio de devoluciones.
   - Cantidad de transacciones de cada tipo.
5. La operación de lectura (GET /statistics) debe ser O(1).

---

## Requerimientos no funcionales

1. Concurrencia
   - El servicio debe ser seguro para acceso concurrente.
   - Justifica las decisiones tomadas (locks, estructuras lock-free, etc.).
2. Alta tasa de escritura
   - El sistema debe manejar múltiples transacciones por segundo sin degradar significativamente el rendimiento.
3. Manejo de timestamps
   - Define y documenta cómo se manejan:
   - Transacciones con timestamp en el futuro.
   - Transacciones más antiguas que la ventana de 60 segundos.
   - Implementa la política elegida de forma consistente.
4. Eficiencia en memoria
   - La solución debe usar memoria de forma acotada (no crecer indefinidamente).
   - Explica cómo se eliminan o expiran datos antiguos.

---

## Entregables

- Código fuente.
- Instrucciones para ejecutar el servicio.
- Breve documentación (README) que explique:
- Decisiones de diseño.
- Complejidad de las operaciones.
- Supuestos realizados.
