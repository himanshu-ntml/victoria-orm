/**
 * Schema definitions for VictoriaLogs streams.
 *
 * Like Drizzle's pgTable — define typed streams with typed fields.
 *
 * @example
 *   import { stream, text, timestamp, enm } from 'victoria-orm';
 *
 *   export const emails = stream('email-archive', {
 *     id: text('id'),
 *     to: text('to').notNull(),
 *     subject: text('subject'),
 *     status: enm('status', ['delivered', 'bounced', 'deferred', 'opened', 'clicked']),
 *   });
 */

// ── Column Types ──

export interface Column<TName extends string = string, TType = string> {
    readonly fieldName: TName;
    readonly kind: "text" | "timestamp" | "enum";
    readonly _type: TType;
    readonly required: boolean;
}

export interface TextColumn<TName extends string = string>
    extends Column<TName, string> {
    readonly kind: "text";
    /** Mark this field as required for inserts */
    notNull(): TextColumn<TName>;
}

export interface TimestampColumn<TName extends string = string>
    extends Column<TName, string> {
    readonly kind: "timestamp";
    notNull(): TimestampColumn<TName>;
}

export interface EnumColumn<
    TName extends string = string,
    TValues extends string = string,
> extends Column<TName, TValues> {
    readonly kind: "enum";
    readonly values: readonly TValues[];
    notNull(): EnumColumn<TName, TValues>;
}

// ── Column Factories ──

export function text<TName extends string>(fieldName: TName): TextColumn<TName> {
    const col: TextColumn<TName> = {
        fieldName,
        kind: "text",
        _type: "" as string,
        required: false,
        notNull() {
            return { ...this, required: true };
        },
    } as TextColumn<TName>;
    return col;
}

export function timestamp<TName extends string>(
    fieldName: TName
): TimestampColumn<TName> {
    return {
        fieldName,
        kind: "timestamp",
        _type: "" as string,
        required: false,
        notNull() {
            return { ...this, required: true };
        },
    } as TimestampColumn<TName>;
}

export function enm<TName extends string, const TValues extends string>(
    fieldName: TName,
    values: readonly TValues[]
): EnumColumn<TName, TValues> {
    return {
        fieldName,
        kind: "enum",
        values,
        _type: "" as unknown as TValues,
        required: false,
        notNull() {
            return { ...this, required: true };
        },
    } as EnumColumn<TName, TValues>;
}

// ── Stream (like pgTable) ──

export type StreamFields = Record<string, Column<string, unknown>>;

/** Infer the SELECT result type from a stream's fields */
export type InferStream<T extends StreamFields> = {
    [K in keyof T]: T[K]["_type"];
} & {
    _time?: string;
    _msg?: string;
    _stream?: string;
};

/** Infer the INSERT type — required fields are non-optional */
export type InferInsert<T extends StreamFields> = {
    [K in keyof T as T[K]["required"] extends true ? K : never]: T[K]["_type"];
} & {
    [K in keyof T as T[K]["required"] extends true ? never : K]?: T[K]["_type"];
};

export interface Stream<TFields extends StreamFields = StreamFields> {
    readonly streamName: string;
    readonly fields: TFields;
    readonly columns: { [K in keyof TFields]: TFields[K] };
}

/**
 * Define a stream schema — like Drizzle's `pgTable()`.
 *
 * @example
 *   export const emails = stream('email-archive', {
 *     to: text('to').notNull(),
 *     status: enm('status', ['delivered', 'bounced']),
 *   });
 *
 *   emails.to       // → Column
 *   emails.status   // → EnumColumn
 */
export function stream<TFields extends StreamFields>(
    name: string,
    fields: TFields
): Stream<TFields> & TFields {
    const s: Stream<TFields> = {
        streamName: name,
        fields,
        columns: fields,
    };

    return new Proxy(s, {
        get(target, prop: string) {
            if (prop in target) {
                return (target as unknown as Record<string, unknown>)[prop];
            }
            if (prop in fields) {
                return fields[prop];
            }
            return undefined;
        },
    }) as Stream<TFields> & TFields;
}
