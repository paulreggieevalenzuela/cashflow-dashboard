"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  allPaymentMethods,
  hmoPaymentNames,
  paymentTypeNames,
  paymentTypeOptions,
  setCustomPaymentMethods,
  type CustomPaymentMethod,
} from "@/lib/cashflow/payment-methods";

const PaymentMethodsContext = createContext<readonly CustomPaymentMethod[]>([]);

/**
 * Hands the payment methods an owner or admin added to the browser (the
 * layout reads them from the database). The registry the pure helpers read
 * (`isHmoPayment` and friends) is filled here first, before anything below
 * renders, so the forms and the price-list rules agree. A change made on the
 * Payment methods screen arrives with the next refresh of the layout.
 */
export function PaymentMethodsProvider({
  methods,
  children,
}: {
  methods: readonly CustomPaymentMethod[];
  children: ReactNode;
}) {
  setCustomPaymentMethods(methods);
  return (
    <PaymentMethodsContext.Provider value={methods}>
      {children}
    </PaymentMethodsContext.Provider>
  );
}

/**
 * The payment types to offer on a new visit or payment (hidden ones left out,
 * except the one already on the record, `current`). Re-renders when the list
 * changes.
 */
export function usePaymentTypeOptions(current?: string | null): string[] {
  useContext(PaymentMethodsContext);
  return paymentTypeOptions(current);
}

/** Every payment type, hidden ones included (filters and history). */
export function useAllPaymentTypes(): string[] {
  useContext(PaymentMethodsContext);
  return paymentTypeNames();
}

/** Every HMO, hidden ones included (price lists, billing). */
export function useHmoNames(): string[] {
  useContext(PaymentMethodsContext);
  return hmoPaymentNames();
}

/** Every method with its kind and state (the management screen). */
export function useAllPaymentMethods() {
  useContext(PaymentMethodsContext);
  return allPaymentMethods();
}
