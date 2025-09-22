 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/src/App.jsx b/src/App.jsx
index 2c6f00d112aa8c153d64d90738a899550db1a507..73caba4d2cb4b4f4f181973107938d93f6f9d5bb 100644
--- a/src/App.jsx
+++ b/src/App.jsx
@@ -267,50 +267,63 @@ export default function App() {
           />
         </div>
       </section>
 
       {/* DETAILS (comfortable prose) */}
       <section className="bg-white py-14 px-6">
         <div className="max-w-4xl mx-auto text-neutral-800 space-y-5 leading-7">
           <h2 className="text-2xl font-semibold">Transparent pricing</h2>
           <p>
             LET doesn’t depend on market makers or hidden algorithms. The price references
             the latest global life expectancy (years). If the world adds healthy years,
             the fair price goes up — simple and auditable.
           </p>
 
           <h3 className="text-xl font-semibold">Fees & sustainability</h3>
           <p>
             A small fee on mint/redeem (e.g. ~0.3%) accrues to the protocol as USDC
             surplus. This helps fund data updates, audits and development of open tooling.
           </p>
 
           <h3 className="text-xl font-semibold">Risks</h3>
           <p className="opacity-90">
             As with any crypto protocol, smart-contract risk and oracle update cadence
             apply. Never deposit more than you can afford to hold.
           </p>
+
+          <p className="opacity-90">
+            The LET smart contract is fully open and the token is verified on{" "}
+            <a
+              href="https://arbiscan.io/address/0xD47B8Fb7A323cB095Ec80BE7a704AF0e9ef5Cc72#code"
+              target="_blank"
+              rel="noreferrer"
+              className="text-sky-600 hover:underline"
+            >
+              Arbiscan
+            </a>
+            , providing on-chain transparency you can audit anytime.
+          </p>
         </div>
       </section>
 
       {/* MINT UI */}
       <section id="mint" className="min-h-screen bg-neutral-50 py-16">
         <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8 px-4">
           {/* Left: guided flow */}
           <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 space-y-6">
             <h2 className="text-2xl font-semibold">Buy / Mint LET</h2>
             <p className="text-sm text-neutral-600">
               Flow: <strong>Connect</strong> → <strong>Approve</strong> USDC for the amount
               you plan to mint → <strong>Mint LET</strong>. Your funds stay in your wallet until you confirm.
              Please note: to see your <strong>LET</strong> and <strong>USDC</strong> balances - please add <strong>Arbitrium  One</strong> network and Coins:
               USDC address: <strong>0xaf88d065e77c8cC2239327C5EDb3A432268e5831</strong>, 
               LET Address: <strong>0xD47B8Fb7A323cB095Ec80BE7a704AF0e9ef5Cc72</strong>
             </p>
 
             {/* Amount input */}
             <div>
               <label className="block text-sm text-neutral-600 mb-2">Amount (USDC)</label>
               <input
                 inputMode="decimal"
                 value={amount}
                 onChange={(e) => setAmount(e.target.value)}
                 placeholder="0.00"
 
EOF
)
