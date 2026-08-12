import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShoppingBag, Trash2, Plus, Minus, ArrowRight } from "lucide-react";
import { useCart } from "../../context/CartContext";
import { useI18n } from "../../lib/LangContext";
import { money } from "../../utils/helpers";

export function Cart() {
  const { items, isOpen, setIsOpen, removeItem, updateQuantity, cartTotal, cartCount } = useCart();
  const { t } = useI18n();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-surface shadow-2xl z-50 flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2">
                <ShoppingBag size={20} style={{ color: "var(--accent)" }} />
                <h2 className="disp text-lg font-semibold">
                  {t("cart.title", "עגלת קניות")} ({cartCount})
                </h2>
              </div>
              <button onClick={() => setIsOpen(false)} className="tap p-2 rounded-xl" style={{ background: "var(--bg)" }}>
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <ShoppingBag size={48} style={{ color: "var(--text-faint)" }} />
                  <p className="mt-4 text-sm text-muted">{t("cart.empty", "העגלה ריקה")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => (
                    <motion.div
                      key={item.product.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="surface rounded-xl p-3 flex gap-3"
                    >
                      <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-gray-100">
                        {item.product.image ? (
                          <img src={item.product.image} alt={item.product.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ShoppingBag size={24} style={{ color: "var(--text-faint)" }} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold line-clamp-2">{item.product.title}</p>
                        <p className="text-xs text-muted mt-1">
                          {item.marketer?.name || t("cart.unknownCreator", "יוצר לא ידוע")}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2">
                            <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} className="tap p-1 rounded-lg" style={{ background: "var(--bg)" }}>
                              <Minus size={14} />
                            </button>
                            <span className="text-sm font-semibold w-6 text-center">{item.quantity}</span>
                            <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)} className="tap p-1 rounded-lg" style={{ background: "var(--bg)" }}>
                              <Plus size={14} />
                            </button>
                          </div>
                          <span className="mono text-sm font-bold" style={{ color: "var(--accent)" }}>
                            {money(item.product.price * item.quantity, "he")}
                          </span>
                        </div>
                      </div>
                      <button onClick={() => removeItem(item.product.id)} className="tap p-2 rounded-lg shrink-0" style={{ color: "var(--danger)" }}>
                        <Trash2 size={16} />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="p-4 border-t space-y-3" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">{t("cart.subtotal", "סה\"כ ביניים")}</span>
                  <span className="mono font-bold" style={{ color: "var(--accent)" }}>
                    {money(cartTotal, "he")}
                  </span>
                </div>
                <button className="tap w-full btn-primary py-3.5 rounded-xl flex items-center justify-center gap-2 font-semibold">
                  {t("cart.checkout", "לתשלום")} <ArrowRight size={18} />
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
