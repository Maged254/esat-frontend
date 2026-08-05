// The Outsource page reuses the Employees page in "outsource mode" so the look,
// menu, warnings and modals never drift from the original.
import { EmployeesPage } from './OtherPages';

export default function OutsourcePage() {
  return <EmployeesPage outsource />;
}
