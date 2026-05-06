import { redirect } from "next/navigation";

export default function InventoryRoot() {
  redirect("/development-os/inventory/items");
}
