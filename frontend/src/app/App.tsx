import React, { useState, useEffect } from "react";

import { ContractContextWrapper } from "./contractContext";
import { signer, provider } from "./provider";

export const App = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    signer
      .getAddress()
      .then((address) => {
        setConnectedAddress(address);
      })
      .catch((e) => {})
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);

  if (loading) {
    return <div>loading...</div>;
  }

  if (!connectedAddress) {
    return (
      <div>
        Welcome. Log in first!{" "}
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          onClick={async () => {
            try {
              const address = await signer.getAddress();
              setConnectedAddress(address);
            } catch (err) {
              try {
                const [address] = await provider.send(
                  "eth_requestAccounts",
                  []
                );
                if (address && typeof address === "string") {
                  setConnectedAddress(address);
                }
              } catch (e) {
                alert("Something went wrong.");
              }
            }
          }}
        >
          Log in
        </button>
      </div>
    );
  } else {
    return (
      <div>
        <ContractContextWrapper />
      </div>
    );
  }
};
