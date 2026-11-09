import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { OffboardingSettlementStatus } from "@picode-hr/shared";
import { apiDownload, apiSend } from "../api/client";
import { useApiQuery } from "../api/hooks";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "../components/ui";

interface OffboardingRecord {
  lastWorkingDate: string;
  knowledgeTransferCompleted: boolean;
  managerApprovalReceived: boolean;
  assetsIssued: boolean;
  assetsReturned: boolean;
  settlementStartedAt: string | null;
  settlementStatus: OffboardingSettlementStatus;
}

interface OffboardingRow {
  offerId: string;
  candidateName: string;
  roleTitle: string;
  projectName?: string | null;
  joiningDate?: string | null;
  offboarding: OffboardingRecord | null;
}

type Checkpoint =
  | "knowledgeTransferCompleted"
  | "managerApprovalReceived"
  | "assetsReturned";

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

function isReadyForSettlement(record: OffboardingRecord): boolean {
  return (
    record.knowledgeTransferCompleted &&
    record.managerApprovalReceived &&
    (!record.assetsIssued || record.assetsReturned)
  );
}

export function Offboarding() {
  const queryClient = useQueryClient();
  const {
    data: rows,
    isLoading,
    error,
  } = useApiQuery<OffboardingRow[]>(
    ["offboarding"],
    "/offers/tracking/offboarding",
  );
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [lastWorkingDate, setLastWorkingDate] = useState("");
  const [assetsIssued, setAssetsIssued] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const list = rows ?? [];
  const selectedRow = list.find((row) => row.offerId === selectedOfferId);

  const closeModal = () => {
    setSelectedOfferId(null);
    setLastWorkingDate("");
    setAssetsIssued(false);
    setFormError(null);
  };

  const startOffboarding = async () => {
    if (!selectedOfferId) return;
    if (!lastWorkingDate) {
      setFormError("Enter the last working date.");
      return;
    }

    setSavingKey(selectedOfferId);
    setFormError(null);
    try {
      await apiSend(`/offers/${selectedOfferId}/offboarding`, "POST", {
        lastWorkingDate,
        assetsIssued,
      });
      await queryClient.invalidateQueries({ queryKey: ["offboarding"] });
      closeModal();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to start offboarding.",
      );
    } finally {
      setSavingKey(null);
    }
  };

  const updateCheckpoint = async (
    row: OffboardingRow,
    checkpoint: Checkpoint,
  ) => {
    const key = `${row.offerId}-${checkpoint}`;
    setSavingKey(key);
    setActionError(null);
    try {
      await apiSend(`/offers/${row.offerId}/offboarding`, "PUT", {
        [checkpoint]: true,
      });
      await queryClient.invalidateQueries({ queryKey: ["offboarding"] });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update offboarding.",
      );
    } finally {
      setSavingKey(null);
    }
  };

  const startSettlement = async (row: OffboardingRow) => {
    const key = `${row.offerId}-settlement`;
    setSavingKey(key);
    setActionError(null);
    setActionSuccess(null);
    try {
      await apiDownload(
        `/offers/${row.offerId}/offboarding/settlement`,
        `${row.offerId}-Relieving-Experience-Letter.pdf`,
        "POST",
      );
      await queryClient.invalidateQueries({ queryKey: ["offboarding"] });
      setActionSuccess("F&F started and the relieving/experience letter was downloaded.");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to start F&F settlement.",
      );
    } finally {
      setSavingKey(null);
    }
  };

  const completeSettlement = async (row: OffboardingRow) => {
    const key = `${row.offerId}-settlement-status`;
    setSavingKey(key);
    setActionError(null);
    setActionSuccess(null);
    try {
      await apiSend(
        `/offers/${row.offerId}/offboarding/settlement/complete`,
        "POST",
        {},
      );
      await queryClient.invalidateQueries({ queryKey: ["offboarding"] });
      setActionSuccess("F&F settlement marked as completed.");
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Failed to complete F&F settlement.",
      );
    } finally {
      setSavingKey(null);
    }
  };

  const updateSettlementStatus = (
    row: OffboardingRow,
    status: string | null,
  ) => {
    if (status === "IN_PROGRESS") {
      void startSettlement(row);
    } else if (status === "COMPLETED") {
      void completeSettlement(row);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-300">
        Failed to load offboarding tracker: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offboarding"
        subtitle={`${list.length} joined candidate${list.length !== 1 ? "s" : ""} eligible for offboarding`}
      />

      {actionError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-300"
        >
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div
          role="status"
          className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/40 dark:text-green-300"
        >
          {actionSuccess}
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState
          title="No Offboard candidates"
          description="Candidates marked as offboard will appear here."
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <Thead>
                <Tr>
                  <Th>Candidate</Th>
                  <Th>Role / Project</Th>
                  <Th>Last Working Day</Th>
                  <Th>KT</Th>
                  <Th>Manager Approval</Th>
                  <Th>Assets</Th>
                  <Th>F&amp;F Settlement</Th>
                </Tr>
              </Thead>
              <Tbody>
                {list.map((row) => {
                  const record = row.offboarding;
                  return (
                    <Tr key={row.offerId}>
                      <Td>
                        <div className="font-medium">{row.candidateName}</div>
                        <div className="text-xs text-muted-foreground">
                          Joined {fmtDate(row.joiningDate)}
                        </div>
                      </Td>
                      <Td>
                        <div>{row.roleTitle}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.projectName ?? "—"}
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap">
                        {record ? fmtDate(record.lastWorkingDate) : "—"}
                      </Td>
                      <Td>
                        {!record ? (
                          "—"
                        ) : (
                          <CheckpointButton
                            done={record.knowledgeTransferCompleted}
                            label="Complete"
                            loading={
                              savingKey ===
                              `${row.offerId}-knowledgeTransferCompleted`
                            }
                            onClick={() =>
                              updateCheckpoint(
                                row,
                                "knowledgeTransferCompleted",
                              )
                            }
                          />
                        )}
                      </Td>
                      <Td>
                        {!record ? (
                          "—"
                        ) : (
                          <CheckpointButton
                            done={record.managerApprovalReceived}
                            label="Approval received"
                            loading={
                              savingKey ===
                              `${row.offerId}-managerApprovalReceived`
                            }
                            onClick={() =>
                              updateCheckpoint(row, "managerApprovalReceived")
                            }
                          />
                        )}
                      </Td>
                      <Td>
                        {!record ? (
                          "—"
                        ) : !record.assetsIssued ? (
                          <span className="text-xs text-muted-foreground">
                            Not applicable
                          </span>
                        ) : (
                          <CheckpointButton
                            done={record.assetsReturned}
                            label="Returned"
                            loading={
                              savingKey === `${row.offerId}-assetsReturned`
                            }
                            onClick={() =>
                              updateCheckpoint(row, "assetsReturned")
                            }
                          />
                        )}
                      </Td>
                      <Td>
                        {!record ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedOfferId(row.offerId)}
                          >
                            Start offboarding
                          </Button>
                        ) : (
                          <div className="space-y-1">
                            <Select
                              value={record.settlementStatus}
                              onValueChange={(status) =>
                                updateSettlementStatus(row, status)
                              }
                              disabled={
                                savingKey === `${row.offerId}-settlement` ||
                                savingKey ===
                                  `${row.offerId}-settlement-status` ||
                                record.settlementStatus === "COMPLETED"
                              }
                            >
                              <SelectTrigger
                                className={`w-40 ${
                                  record.settlementStatus === "COMPLETED"
                                    ? "text-green-700 dark:text-green-300"
                                    : record.settlementStatus === "IN_PROGRESS"
                                      ? "text-blue-700 dark:text-blue-300"
                                      : ""
                                }`}
                                aria-label={`F&F settlement status for ${row.candidateName}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem
                                  value="NOT_STARTED"
                                  disabled={
                                    record.settlementStatus !== "NOT_STARTED"
                                  }
                                >
                                  Not started
                                </SelectItem>
                                <SelectItem
                                  value="IN_PROGRESS"
                                  disabled={
                                    record.settlementStatus !== "NOT_STARTED" ||
                                    !isReadyForSettlement(record)
                                  }
                                >
                                  In progress
                                </SelectItem>
                                <SelectItem
                                  value="COMPLETED"
                                  disabled={
                                    record.settlementStatus !== "IN_PROGRESS"
                                  }
                                >
                                  Completed
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {record.settlementStartedAt && (
                              <div className="text-xs text-muted-foreground">
                                Started {fmtDate(record.settlementStartedAt)}
                              </div>
                            )}
                          </div>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Modal
        open={Boolean(selectedRow)}
        onClose={closeModal}
        title={`Start offboarding${selectedRow ? ` — ${selectedRow.candidateName}` : ""}`}
      >
        <div className="space-y-4">
          <Field label="Last Working Day" htmlFor="last-working-date" required>
            <Input
              id="last-working-date"
              type="date"
              value={lastWorkingDate}
              onChange={(event) => setLastWorkingDate(event.target.value)}
              required
            />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={assetsIssued}
              onChange={(event) => setAssetsIssued(event.target.checked)}
              className="mt-1"
            />
            <span>Company assets were issued and must be returned</span>
          </label>
          {formError && (
            <p role="alert" className="text-sm text-red-600">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              loading={savingKey === selectedOfferId}
              onClick={startOffboarding}
            >
              Start offboarding
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function CheckpointButton({
  done,
  label,
  loading,
  onClick,
}: {
  done: boolean;
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return done ? (
    <Badge variant="success">{label}</Badge>
  ) : (
    <Button size="sm" variant="outline" loading={loading} onClick={onClick}>
      Mark done
    </Button>
  );
}
